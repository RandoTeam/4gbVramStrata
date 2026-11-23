// src/quant/x86/nvfp4_avx2.inc - Optimized AVX2 NVFP4 kernels (0 EVEX/ZMM instructions).
// Included inside namespace strata::quant::avx2 in dot_avx2.cpp.
// Combines a compile-time 256-entry UE4M3 scale LUT with 256-bit vpshufb decode and
// Basalt-style pre-unpacked TokBlk activation reuse across weight rows [r0, r1).

namespace nvfp4_detail {

// Compile-time 256-entry UE4M3 table matching ue4m3_formula(x) bit-for-bit across all 0..255 bytes
// without runtime static initialization in an AVX2 translation unit.
struct ScaleLut256 {
    float v[256];
    constexpr ScaleLut256() : v{} {
        for (uint32_t x = 0; x < 256; ++x) {
            if (x == 0 || x == 0x7F) {
                v[x] = 0.0f;
            } else {
                const uint32_t e = (x >> 3) & 0xFu;
                const uint32_t m = x & 7u;
                if (e == 0) v[x] = (float) m * (1.0f / 1024.0f);
                else v[x] = std::bit_cast<float>((uint32_t) (((e + 119u) << 23) | (m << 20)));
            }
        }
    }
};
inline constexpr ScaleLut256 kNvfp4Lut{};

constexpr int kMaxN = 16384;
constexpr int kMaxT = 8;

struct alignas(32) TokBlk {
    __m256i ya, yb;
    __m256 d;
};

inline TokBlk* tok_buf() {
    alignas(32) static thread_local TokBlk buf[kMaxT * kMaxN / QK_NVFP4];
    return buf;
}

struct Nvfp4Blk {
    __m256i aa, ab;
    __m256i wa, wb;
    __m256 sa, sb;
};

inline Nvfp4Blk decode_blk(const block_nvfp4* x, const __m256i values256, const __m256i m4b) {
    const __m256i q = _mm256_loadu_si256((const __m256i*) x->qs);
    const __m256i lo = _mm256_and_si256(q, m4b);
    const __m256i hi = _mm256_and_si256(_mm256_srli_epi16(q, 4), m4b);
    Nvfp4Blk b;
    b.wa = _mm256_shuffle_epi8(values256, _mm256_unpacklo_epi64(lo, hi));
    b.wb = _mm256_shuffle_epi8(values256, _mm256_unpackhi_epi64(lo, hi));
    b.aa = _mm256_sign_epi8(b.wa, b.wa);
    b.ab = _mm256_sign_epi8(b.wb, b.wb);
    const float s0 = kNvfp4Lut.v[x->d[0]], s1 = kNvfp4Lut.v[x->d[1]];
    const float s2 = kNvfp4Lut.v[x->d[2]], s3 = kNvfp4Lut.v[x->d[3]];
    b.sa = _mm256_setr_ps(s0, s0, s0, s0, s2, s2, s2, s2);
    b.sb = _mm256_setr_ps(s1, s1, s1, s1, s3, s3, s3, s3);
    return b;
}

template <int NT>
inline void prep_tokens(const block_q8_0* const* y, int nb, TokBlk* tb) {
    for (int ib = 0; ib < nb; ++ib) {
        if (ib + 4 < nb) {
            for (int t = 0; t < NT; ++t) _mm_prefetch((const char*) &y[t][2 * (ib + 4)], _MM_HINT_T0);
        }
        for (int t = 0; t < NT; ++t) {
            const __m256i y0 = _mm256_loadu_si256((const __m256i*) y[t][2 * ib].qs);
            const __m256i y1 = _mm256_loadu_si256((const __m256i*) y[t][2 * ib + 1].qs);
            TokBlk& dst = tb[(size_t) ib * NT + t];
            dst.ya = _mm256_permute2x128_si256(y0, y1, 0x20);
            dst.yb = _mm256_permute2x128_si256(y0, y1, 0x31);
            dst.d = _mm256_insertf128_ps(_mm256_castps128_ps256(_mm_set1_ps(h2f(y[t][2 * ib].d))),
                                         _mm_set1_ps(h2f(y[t][2 * ib + 1].d)), 1);
        }
    }
}

template <int R, int NT>
inline void rows_dot(const block_nvfp4* const* w, int nb, const TokBlk* tb, float (*res)[kMaxT]) {
    const __m128i v128 = _mm_loadu_si128((const __m128i*) kvalues_fp4);
    const __m256i values256 = _mm256_inserti128_si256(_mm256_castsi128_si256(v128), v128, 1);
    const __m256i m4b = _mm256_set1_epi8(0x0f);
    const __m256i ones = _mm256_set1_epi16(1);

    __m256 acc1[R][NT], acc2[R][NT];
    for (int k = 0; k < R; ++k)
        for (int t = 0; t < NT; ++t) acc1[k][t] = acc2[k][t] = _mm256_setzero_ps();

    for (int ib = 0; ib < nb; ++ib) {
        if (ib + 4 < nb) {
            for (int k = 0; k < R; ++k) _mm_prefetch((const char*) (w[k] + ib + 4), _MM_HINT_T0);
        }
        Nvfp4Blk b[R];
        for (int k = 0; k < R; ++k) b[k] = decode_blk(w[k] + ib, values256, m4b);
        const TokBlk* tk = tb + (size_t) ib * NT;
        for (int t = 0; t < NT; ++t) {
            const __m256i ya = tk[t].ya;
            const __m256i yb = tk[t].yb;
            const __m256 d = tk[t].d;
            for (int k = 0; k < R; ++k) {
                const __m256i pa = _mm256_madd_epi16(_mm256_maddubs_epi16(b[k].aa, _mm256_sign_epi8(ya, b[k].wa)), ones);
                const __m256i pb = _mm256_madd_epi16(_mm256_maddubs_epi16(b[k].ab, _mm256_sign_epi8(yb, b[k].wb)), ones);
                acc1[k][t] = _mm256_fmadd_ps(_mm256_mul_ps(d, b[k].sa), _mm256_cvtepi32_ps(pa), acc1[k][t]);
                acc2[k][t] = _mm256_fmadd_ps(_mm256_mul_ps(d, b[k].sb), _mm256_cvtepi32_ps(pb), acc2[k][t]);
            }
        }
    }
    for (int k = 0; k < R; ++k)
        for (int t = 0; t < NT; ++t) res[k][t] = hsum_float_8(_mm256_add_ps(acc1[k][t], acc2[k][t]));
}

template <int NT>
void gu_rows_nt(const uint8_t* gate, size_t g_row, const uint8_t* up, size_t u_row, int n,
                const void* const* act, float* g_out, float* u_out, int r0, int r1) {
    const block_q8_0* y[NT];
    for (int t = 0; t < NT; ++t) y[t] = (const block_q8_0*) act[t];
    const int nb = n / QK_NVFP4;
    TokBlk* tb = tok_buf();
    prep_tokens<NT>(y, nb, tb);
    const size_t nr = (size_t) (r1 - r0);
    float res[2][kMaxT];
    for (int r = r0; r < r1; ++r) {
        const block_nvfp4* w[2] = {(const block_nvfp4*) (gate + (size_t) r * g_row),
                                   (const block_nvfp4*) (up + (size_t) r * u_row)};
        if constexpr (NT <= 2) {
            rows_dot<2, NT>(w, nb, tb, res);
        } else {
            rows_dot<1, NT>(&w[0], nb, tb, &res[0]);
            rows_dot<1, NT>(&w[1], nb, tb, &res[1]);
        }
        const size_t dr = (size_t) (r - r0);
        for (int t = 0; t < NT; ++t) {
            g_out[(size_t) t * nr + dr] = res[0][t];
            u_out[(size_t) t * nr + dr] = res[1][t];
        }
    }
}

template <int NT>
void down_rows_nt(const uint8_t* down, size_t d_row, int n, const void* const* act, float* out, int r0, int r1) {
    const block_q8_0* y[NT];
    for (int t = 0; t < NT; ++t) y[t] = (const block_q8_0*) act[t];
    const int nb = n / QK_NVFP4;
    TokBlk* tb = tok_buf();
    prep_tokens<NT>(y, nb, tb);
    const size_t nr = (size_t) (r1 - r0);
    float res[2][kMaxT];
    int r = r0;
    if constexpr (NT <= 2) {
        for (; r + 2 <= r1; r += 2) {
            const block_nvfp4* w[2] = {(const block_nvfp4*) (down + (size_t) r * d_row),
                                       (const block_nvfp4*) (down + (size_t) (r + 1) * d_row)};
            rows_dot<2, NT>(w, nb, tb, res);
            const size_t dr = (size_t) (r - r0);
            for (int t = 0; t < NT; ++t) {
                out[(size_t) t * nr + dr + 0] = res[0][t];
                out[(size_t) t * nr + dr + 1] = res[1][t];
            }
        }
    }
    for (; r < r1; ++r) {
        const block_nvfp4* w[1] = {(const block_nvfp4*) (down + (size_t) r * d_row)};
        rows_dot<1, NT>(w, nb, tb, res);
        const size_t dr = (size_t) (r - r0);
        for (int t = 0; t < NT; ++t) out[(size_t) t * nr + dr] = res[0][t];
    }
}

}  // namespace nvfp4_detail

// Bit-exact replacement for dot_nvfp4_q8_0 (0 ULP vs golden_x86.txt).
void dot_nvfp4_q8_0_opt(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* STRATA_RESTRICT vy) {
    assert(n % QK_NVFP4 == 0);
    const block_nvfp4* STRATA_RESTRICT x = (const block_nvfp4*) vx;
    const block_q8_0* STRATA_RESTRICT y = (const block_q8_0*) vy;
    const int nb = n / QK_NVFP4;

    const __m128i v128 = _mm_loadu_si128((const __m128i*) kvalues_fp4);
    const __m256i values256 = _mm256_inserti128_si256(_mm256_castsi128_si256(v128), v128, 1);
    const __m256i m4b = _mm256_set1_epi8(0x0f);
    const __m256i ones = _mm256_set1_epi16(1);

    __m256 accum = _mm256_setzero_ps();
    for (int ib = 0; ib < nb; ++ib) {
        if (ib + 4 < nb) {
            _mm_prefetch((const char*) &x[ib + 4], _MM_HINT_T0);
            _mm_prefetch((const char*) &y[2 * (ib + 4)], _MM_HINT_T0);
        }
        const __m256i q = _mm256_loadu_si256((const __m256i*) x[ib].qs);
        const __m256i lo = _mm256_and_si256(q, m4b);
        const __m256i hi = _mm256_and_si256(_mm256_srli_epi16(q, 4), m4b);
        const __m256i wa = _mm256_shuffle_epi8(values256, _mm256_unpacklo_epi64(lo, hi));
        const __m256i wb = _mm256_shuffle_epi8(values256, _mm256_unpackhi_epi64(lo, hi));
        const __m256i q4_01 = _mm256_permute2x128_si256(wa, wb, 0x20);
        const __m256i q4_23 = _mm256_permute2x128_si256(wa, wb, 0x31);

        const __m256i q8_01 = _mm256_loadu_si256((const __m256i*) y[2 * ib + 0].qs);
        const __m256i q8_23 = _mm256_loadu_si256((const __m256i*) y[2 * ib + 1].qs);

        const __m256 p_1 = _mm256_cvtepi32_ps(_mm256_madd_epi16(
            ones, _mm256_maddubs_epi16(_mm256_sign_epi8(q4_01, q4_01), _mm256_sign_epi8(q8_01, q4_01))));
        const __m256 p_2 = _mm256_cvtepi32_ps(_mm256_madd_epi16(
            ones, _mm256_maddubs_epi16(_mm256_sign_epi8(q4_23, q4_23), _mm256_sign_epi8(q8_23, q4_23))));

        const float dy0 = h2f(y[2 * ib + 0].d);
        const float dy1 = h2f(y[2 * ib + 1].d);
        const float s0 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[0]] * dy0;
        const float s1 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[1]] * dy0;
        const float s2 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[2]] * dy1;
        const float s3 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[3]] * dy1;

        const __m256 scales01 = _mm256_setr_ps(s0, s0, s0, s0, s1, s1, s1, s1);
        const __m256 scales23 = _mm256_setr_ps(s2, s2, s2, s2, s3, s3, s3, s3);

        accum = _mm256_fmadd_ps(scales01, p_1, accum);
        accum = _mm256_fmadd_ps(scales23, p_2, accum);
    }
    *s = hsum_float_8(accum);
}

template <int R>
void rows_nvfp4_q8_0(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* const* vy) {
    assert(n % QK_NVFP4 == 0);
    const block_nvfp4* STRATA_RESTRICT x = (const block_nvfp4*) vx;
    const block_q8_0* y[R];
    for (int r = 0; r < R; ++r) y[r] = (const block_q8_0*) vy[r];
    const int nb = n / QK_NVFP4;

    const __m128i v128 = _mm_loadu_si128((const __m128i*) kvalues_fp4);
    const __m256i values256 = _mm256_inserti128_si256(_mm256_castsi128_si256(v128), v128, 1);
    const __m256i m4b = _mm256_set1_epi8(0x0f);
    const __m256i ones = _mm256_set1_epi16(1);

    __m256 accum[R];
    for (int r = 0; r < R; ++r) accum[r] = _mm256_setzero_ps();

    for (int ib = 0; ib < nb; ++ib) {
        if (ib + 4 < nb) _mm_prefetch((const char*) &x[ib + 4], _MM_HINT_T0);
        const __m256i q = _mm256_loadu_si256((const __m256i*) x[ib].qs);
        const __m256i lo = _mm256_and_si256(q, m4b);
        const __m256i hi = _mm256_and_si256(_mm256_srli_epi16(q, 4), m4b);
        const __m256i wa = _mm256_shuffle_epi8(values256, _mm256_unpacklo_epi64(lo, hi));
        const __m256i wb = _mm256_shuffle_epi8(values256, _mm256_unpackhi_epi64(lo, hi));
        const __m256i q4_01 = _mm256_permute2x128_si256(wa, wb, 0x20);
        const __m256i q4_23 = _mm256_permute2x128_si256(wa, wb, 0x31);
        const __m256i aq4_01 = _mm256_sign_epi8(q4_01, q4_01);
        const __m256i aq4_23 = _mm256_sign_epi8(q4_23, q4_23);

        const float w0 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[0]];
        const float w1 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[1]];
        const float w2 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[2]];
        const float w3 = nvfp4_detail::kNvfp4Lut.v[x[ib].d[3]];

        for (int r = 0; r < R; ++r) {
            const __m256i q8_01 = _mm256_loadu_si256((const __m256i*) y[r][2 * ib + 0].qs);
            const __m256i q8_23 = _mm256_loadu_si256((const __m256i*) y[r][2 * ib + 1].qs);
            const __m256 p_1 = _mm256_cvtepi32_ps(_mm256_madd_epi16(
                ones, _mm256_maddubs_epi16(aq4_01, _mm256_sign_epi8(q8_01, q4_01))));
            const __m256 p_2 = _mm256_cvtepi32_ps(_mm256_madd_epi16(
                ones, _mm256_maddubs_epi16(aq4_23, _mm256_sign_epi8(q8_23, q4_23))));
            const float dy0 = h2f(y[r][2 * ib + 0].d);
            const float dy1 = h2f(y[r][2 * ib + 1].d);
            const float s0 = w0 * dy0, s1 = w1 * dy0, s2 = w2 * dy1, s3 = w3 * dy1;
            const __m256 scales01 = _mm256_setr_ps(s0, s0, s0, s0, s1, s1, s1, s1);
            const __m256 scales23 = _mm256_setr_ps(s2, s2, s2, s2, s3, s3, s3, s3);
            accum[r] = _mm256_fmadd_ps(scales01, p_1, accum[r]);
            accum[r] = _mm256_fmadd_ps(scales23, p_2, accum[r]);
        }
    }
    for (int r = 0; r < R; ++r) s[r] = hsum_float_8(accum[r]);
}
