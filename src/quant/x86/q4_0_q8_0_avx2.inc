// src/quant/x86/q4_0_q8_0_avx2.inc - Bit-exact AVX2 opt, x4, and multi-token rows kernels for Q4_0 and Q8_0.
// Included inside namespace strata::quant::avx2 in dot_avx2.cpp. Zero EVEX/ZMM instructions, 0 ULP vs x86_dots.inc.

void dot_q4_0_q8_0_opt(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* STRATA_RESTRICT vy) {
    assert(n % QK8_0 == 0);
    const int nb = n / QK8_0;
    const block_q4_0* STRATA_RESTRICT x = (const block_q4_0*) vx;
    const block_q8_0* STRATA_RESTRICT y = (const block_q8_0*) vy;

    const __m256i lowMask = _mm256_set1_epi8(0x0f);
    const __m256i off = _mm256_set1_epi8(8);
    const __m256i ones = _mm256_set1_epi16(1);
    __m256 acc = _mm256_setzero_ps();
    int ib = 0;

    for (; ib + 1 < nb; ib += 2) {
        if (ib + 4 < nb) {
            _mm_prefetch((const char*) &x[ib + 4], _MM_HINT_T0);
            _mm_prefetch((const char*) &y[ib + 4], _MM_HINT_T0);
        }
        const __m256 d0 = _mm256_set1_ps(h2f(x[ib + 0].d) * h2f(y[ib + 0].d));
        const __m256 d1 = _mm256_set1_ps(h2f(x[ib + 1].d) * h2f(y[ib + 1].d));

        const __m128i raw0 = _mm_loadu_si128((const __m128i*) x[ib + 0].qs);
        const __m128i raw1 = _mm_loadu_si128((const __m128i*) x[ib + 1].qs);
        const __m256i qx0 = _mm256_sub_epi8(_mm256_and_si256(MM256_SET_M128I(_mm_srli_epi16(raw0, 4), raw0), lowMask), off);
        const __m256i qx1 = _mm256_sub_epi8(_mm256_and_si256(MM256_SET_M128I(_mm_srli_epi16(raw1, 4), raw1), lowMask), off);

        const __m256i qy0 = _mm256_loadu_si256((const __m256i*) y[ib + 0].qs);
        const __m256i qy1 = _mm256_loadu_si256((const __m256i*) y[ib + 1].qs);

        const __m256i p16_0 = _mm256_maddubs_epi16(_mm256_sign_epi8(qx0, qx0), _mm256_sign_epi8(qy0, qx0));
        const __m256i p16_1 = _mm256_maddubs_epi16(_mm256_sign_epi8(qx1, qx1), _mm256_sign_epi8(qy1, qx1));
        const __m256 q0 = _mm256_cvtepi32_ps(_mm256_madd_epi16(ones, p16_0));
        const __m256 q1 = _mm256_cvtepi32_ps(_mm256_madd_epi16(ones, p16_1));

        acc = _mm256_fmadd_ps(d0, q0, acc);
        acc = _mm256_fmadd_ps(d1, q1, acc);
    }
    for (; ib < nb; ++ib) {
        const __m256 d = _mm256_set1_ps(h2f(x[ib].d) * h2f(y[ib].d));
        const __m128i raw = _mm_loadu_si128((const __m128i*) x[ib].qs);
        const __m256i qx = _mm256_sub_epi8(_mm256_and_si256(MM256_SET_M128I(_mm_srli_epi16(raw, 4), raw), lowMask), off);
        const __m256i qy = _mm256_loadu_si256((const __m256i*) y[ib].qs);
        const __m256i p16 = _mm256_maddubs_epi16(_mm256_sign_epi8(qx, qx), _mm256_sign_epi8(qy, qx));
        acc = _mm256_fmadd_ps(d, _mm256_cvtepi32_ps(_mm256_madd_epi16(ones, p16)), acc);
    }
    *s = hsum_float_8(acc);
}

void dot_q4_0_q8_0_x4_avx2(int n, float out[4], const void* STRATA_RESTRICT w_base, size_t row_bytes, const void* STRATA_RESTRICT vy) {
    assert(n % QK8_0 == 0);
    const int nb = n / QK8_0;
    const uint8_t* wb = (const uint8_t*) w_base;
    const block_q4_0* rows[4] = {
        (const block_q4_0*) (wb + 0 * row_bytes),
        (const block_q4_0*) (wb + 1 * row_bytes),
        (const block_q4_0*) (wb + 2 * row_bytes),
        (const block_q4_0*) (wb + 3 * row_bytes),
    };
    const block_q8_0* STRATA_RESTRICT y = (const block_q8_0*) vy;

    const __m256i lowMask = _mm256_set1_epi8(0x0f);
    const __m256i off = _mm256_set1_epi8(8);
    const __m256i ones = _mm256_set1_epi16(1);
    __m256 acc[4] = {_mm256_setzero_ps(), _mm256_setzero_ps(), _mm256_setzero_ps(), _mm256_setzero_ps()};

    for (int ib = 0; ib < nb; ++ib) {
        if (ib + 4 < nb) {
            for (int r = 0; r < 4; ++r) _mm_prefetch((const char*) &rows[r][ib + 4], _MM_HINT_T0);
        }
        const float dy = h2f(y[ib].d);
        const __m256i qy = _mm256_loadu_si256((const __m256i*) y[ib].qs);
        for (int r = 0; r < 4; ++r) {
            const __m128i raw = _mm_loadu_si128((const __m128i*) rows[r][ib].qs);
            const __m256i qx = _mm256_sub_epi8(_mm256_and_si256(MM256_SET_M128I(_mm_srli_epi16(raw, 4), raw), lowMask), off);
            const __m256i p16 = _mm256_maddubs_epi16(_mm256_sign_epi8(qx, qx), _mm256_sign_epi8(qy, qx));
            acc[r] = _mm256_fmadd_ps(_mm256_set1_ps(h2f(rows[r][ib].d) * dy),
                                     _mm256_cvtepi32_ps(_mm256_madd_epi16(ones, p16)), acc[r]);
        }
    }
    for (int r = 0; r < 4; ++r) out[r] = hsum_float_8(acc[r]);
}

template <int R>
void rows_q4_0_q8_0(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* const* vy) {
    assert(n % QK8_0 == 0);
    const int nb = n / QK8_0;
    const block_q4_0* STRATA_RESTRICT x = (const block_q4_0*) vx;
    const block_q8_0* y[R];
    for (int r = 0; r < R; ++r) y[r] = (const block_q8_0*) vy[r];

    const __m256i lowMask = _mm256_set1_epi8(0x0f);
    const __m256i off = _mm256_set1_epi8(8);
    const __m256i ones = _mm256_set1_epi16(1);
    __m256 acc[R];
    for (int r = 0; r < R; ++r) acc[r] = _mm256_setzero_ps();

    for (int ib = 0; ib < nb; ++ib) {
        if (ib + 4 < nb) _mm_prefetch((const char*) &x[ib + 4], _MM_HINT_T0);
        const float dx = h2f(x[ib].d);
        const __m128i raw = _mm_loadu_si128((const __m128i*) x[ib].qs);
        const __m256i qx = _mm256_sub_epi8(_mm256_and_si256(MM256_SET_M128I(_mm_srli_epi16(raw, 4), raw), lowMask), off);
        const __m256i ax = _mm256_sign_epi8(qx, qx);
        for (int r = 0; r < R; ++r) {
            const __m256i qy = _mm256_loadu_si256((const __m256i*) y[r][ib].qs);
            const __m256i p16 = _mm256_maddubs_epi16(ax, _mm256_sign_epi8(qy, qx));
            acc[r] = _mm256_fmadd_ps(_mm256_set1_ps(dx * h2f(y[r][ib].d)),
                                     _mm256_cvtepi32_ps(_mm256_madd_epi16(ones, p16)), acc[r]);
        }
    }
    for (int r = 0; r < R; ++r) s[r] = hsum_float_8(acc[r]);
}

template <int R>
void rows_q8_0_q8_0(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* const* vy) {
    assert(n % QK8_0 == 0);
    const int nb = n / QK8_0;
    const block_q8_0* STRATA_RESTRICT x = (const block_q8_0*) vx;
    const block_q8_0* y[R];
    for (int r = 0; r < R; ++r) y[r] = (const block_q8_0*) vy[r];

    const __m256i ones = _mm256_set1_epi16(1);
    __m256 acc[R];
    for (int r = 0; r < R; ++r) acc[r] = _mm256_setzero_ps();

    for (int ib = 0; ib < nb; ++ib) {
        if (ib + 4 < nb) _mm_prefetch((const char*) &x[ib + 4], _MM_HINT_T0);
        const float dx = h2f(x[ib].d);
        const __m256i qx = _mm256_loadu_si256((const __m256i*) x[ib].qs);
        const __m256i ax = _mm256_sign_epi8(qx, qx);
        for (int r = 0; r < R; ++r) {
            const __m256i qy = _mm256_loadu_si256((const __m256i*) y[r][ib].qs);
            const __m256i p16 = _mm256_maddubs_epi16(ax, _mm256_sign_epi8(qy, qx));
            acc[r] = _mm256_fmadd_ps(_mm256_set1_ps(dx * h2f(y[r][ib].d)),
                                     _mm256_cvtepi32_ps(_mm256_madd_epi16(ones, p16)), acc[r]);
        }
    }
    for (int r = 0; r < R; ++r) s[r] = hsum_float_8(acc[r]);
}
