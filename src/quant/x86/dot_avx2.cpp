// src/quant/x86/dot_avx2.cpp - the Avx2 contract: ggml-cpu's dot products as its AVX2 + FMA + F16C flavour compiles them (the shipped release flavour).
// Compiled with -mavx2 -mfma -mf16c (/arch:AVX2).  Types ggml has no SIMD branch for (Q2_0) run the Generic code under this contract.
#include "tier_common.hpp"

#include "../generic.hpp"
#include "../registry.hpp"
#include "strata/quant/dot.hpp"

namespace strata::quant {
namespace avx2 {

#include "x86_helpers.inc"
#include "x86_dots.inc"

// dot_iq3_xxs_q8_K for R activation rows at once.  A block's grid values, signs and scales are looked up once for
// all of them, and each row's terms, integer sums and float sums are the one-row function's in the same order, so
// s[r] is its bits.  The lookups were most of that function's time: 226 ns a row of 2,048 on lab-pro6000's cores.
template <int R>
void rows_iq3_xxs_q8_K(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* const* vy) {
    const block_iq3_xxs* STRATA_RESTRICT x = (const block_iq3_xxs*) vx;
    const block_q8_K* y[R];
    for (int r = 0; r < R; ++r) y[r] = (const block_q8_K*) vy[r];
    const int nb = n / QK_K;
    const uint64_t* signs64 = (const uint64_t*) keven_signs_q2xs;
    uint32_t aux32[2];
    __m256 accumf[R];
    for (int r = 0; r < R; ++r) accumf[r] = _mm256_setzero_ps();
    for (int i = 0; i < nb; ++i) {
        const float dw = h2f(x[i].d);
        const uint8_t* STRATA_RESTRICT q3 = x[i].qs;
        const uint8_t* STRATA_RESTRICT gas = x[i].qs + QK_K / 4;
        __m256i sumi1[R], sumi2[R];
        for (int r = 0; r < R; ++r) sumi1[r] = sumi2[r] = _mm256_setzero_si256();
        for (int ib32 = 0; ib32 < QK_K / 32; ib32 += 2) {
            const __m256i q2_1 = _mm256_set_epi32(iq3xxs_grid[q3[7]], iq3xxs_grid[q3[6]], iq3xxs_grid[q3[5]], iq3xxs_grid[q3[4]],
                                                  iq3xxs_grid[q3[3]], iq3xxs_grid[q3[2]], iq3xxs_grid[q3[1]], iq3xxs_grid[q3[0]]);
            q3 += 8;
            const __m256i q2_2 = _mm256_set_epi32(iq3xxs_grid[q3[7]], iq3xxs_grid[q3[6]], iq3xxs_grid[q3[5]], iq3xxs_grid[q3[4]],
                                                  iq3xxs_grid[q3[3]], iq3xxs_grid[q3[2]], iq3xxs_grid[q3[1]], iq3xxs_grid[q3[0]]);
            q3 += 8;
            memcpy(aux32, gas, 8);
            gas += 8;
            const __m256i s2_1 = _mm256_set_epi64x(signs64[(aux32[0] >> 21) & 127], signs64[(aux32[0] >> 14) & 127],
                                                   signs64[(aux32[0] >> 7) & 127], signs64[(aux32[0] >> 0) & 127]);
            const __m256i s2_2 = _mm256_set_epi64x(signs64[(aux32[1] >> 21) & 127], signs64[(aux32[1] >> 14) & 127],
                                                   signs64[(aux32[1] >> 7) & 127], signs64[(aux32[1] >> 0) & 127]);
            const uint16_t ls1 = aux32[0] >> 28;
            const uint16_t ls2 = aux32[1] >> 28;
            const __m256i sc1 = _mm256_set1_epi16(2 * ls1 + 1), sc2 = _mm256_set1_epi16(2 * ls2 + 1);
            for (int r = 0; r < R; ++r) {
                const int8_t* STRATA_RESTRICT q8 = y[r][i].qs + ib32 * 32;
                const __m256i q8s_1 = _mm256_sign_epi8(_mm256_loadu_si256((const __m256i*) q8), s2_1);
                const __m256i q8s_2 = _mm256_sign_epi8(_mm256_loadu_si256((const __m256i*) (q8 + 32)), s2_2);
                sumi1[r] = _mm256_add_epi32(sumi1[r], _mm256_madd_epi16(_mm256_maddubs_epi16(q2_1, q8s_1), sc1));
                sumi2[r] = _mm256_add_epi32(sumi2[r], _mm256_madd_epi16(_mm256_maddubs_epi16(q2_2, q8s_2), sc2));
            }
        }
        for (int r = 0; r < R; ++r) {
            const float d = dw * y[r][i].d;
            accumf[r] = _mm256_fmadd_ps(_mm256_set1_ps(d), _mm256_cvtepi32_ps(_mm256_add_epi32(sumi1[r], sumi2[r])),
                                        accumf[r]);
        }
    }
    for (int r = 0; r < R; ++r) s[r] = 0.25f * hsum_float_8(accumf[r]);
}

// dot_iq2_xxs_q8_K for R rows, as rows_iq3_xxs_q8_K is for its format.
template <int R>
void rows_iq2_xxs_q8_K(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* const* vy) {
    const block_iq2_xxs* STRATA_RESTRICT x = (const block_iq2_xxs*) vx;
    const block_q8_K* y[R];
    for (int r = 0; r < R; ++r) y[r] = (const block_q8_K*) vy[r];
    const int nb = n / QK_K;
    const uint64_t* signs64 = (const uint64_t*) keven_signs_q2xs;
    uint32_t aux32[4];
    const uint8_t* aux8 = (const uint8_t*) aux32;
    __m256 accumf[R];
    for (int r = 0; r < R; ++r) accumf[r] = _mm256_setzero_ps();
    for (int i = 0; i < nb; ++i) {
        const float dw = h2f(x[i].d);
        const uint16_t* STRATA_RESTRICT q2 = x[i].qs;
        __m256i sumi1[R], sumi2[R];
        for (int r = 0; r < R; ++r) sumi1[r] = sumi2[r] = _mm256_setzero_si256();
        for (int ib32 = 0; ib32 < QK_K / 32; ib32 += 2) {
            memcpy(aux32, q2, 4 * sizeof(uint32_t));
            q2 += 8;
            const __m256i q2_1 = _mm256_set_epi64x(iq2xxs_grid[aux8[3]], iq2xxs_grid[aux8[2]], iq2xxs_grid[aux8[1]], iq2xxs_grid[aux8[0]]);
            const __m256i q2_2 = _mm256_set_epi64x(iq2xxs_grid[aux8[11]], iq2xxs_grid[aux8[10]], iq2xxs_grid[aux8[9]], iq2xxs_grid[aux8[8]]);
            const __m256i s2_1 = _mm256_set_epi64x(signs64[(aux32[1] >> 21) & 127], signs64[(aux32[1] >> 14) & 127],
                                                   signs64[(aux32[1] >> 7) & 127], signs64[(aux32[1] >> 0) & 127]);
            const __m256i s2_2 = _mm256_set_epi64x(signs64[(aux32[3] >> 21) & 127], signs64[(aux32[3] >> 14) & 127],
                                                   signs64[(aux32[3] >> 7) & 127], signs64[(aux32[3] >> 0) & 127]);
            const uint16_t ls1 = aux32[1] >> 28;
            const uint16_t ls2 = aux32[3] >> 28;
            const __m256i sc1 = _mm256_set1_epi16(2 * ls1 + 1), sc2 = _mm256_set1_epi16(2 * ls2 + 1);
            for (int r = 0; r < R; ++r) {
                const int8_t* STRATA_RESTRICT q8 = y[r][i].qs + ib32 * 32;
                const __m256i q8s_1 = _mm256_sign_epi8(_mm256_loadu_si256((const __m256i*) q8), s2_1);
                const __m256i q8s_2 = _mm256_sign_epi8(_mm256_loadu_si256((const __m256i*) (q8 + 32)), s2_2);
                sumi1[r] = _mm256_add_epi32(sumi1[r], _mm256_madd_epi16(_mm256_maddubs_epi16(q2_1, q8s_1), sc1));
                sumi2[r] = _mm256_add_epi32(sumi2[r], _mm256_madd_epi16(_mm256_maddubs_epi16(q2_2, q8s_2), sc2));
            }
        }
        for (int r = 0; r < R; ++r) {
            const float d = dw * y[r][i].d;
            accumf[r] = _mm256_fmadd_ps(_mm256_set1_ps(d), _mm256_cvtepi32_ps(_mm256_add_epi32(sumi1[r], sumi2[r])),
                                        accumf[r]);
        }
    }
    for (int r = 0; r < R; ++r) s[r] = 0.125f * hsum_float_8(accumf[r]);
}

// dot_iq2_s_q8_K for R rows, as rows_iq3_xxs_q8_K is for its format.
template <int R>
void rows_iq2_s_q8_K(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* const* vy) {
    static const uint8_t k_mask1[32] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
                                        0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03};
    static const uint8_t k_mask2[32] = {0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80,
                                        0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80};
    const block_iq2_s* STRATA_RESTRICT x = (const block_iq2_s*) vx;
    const block_q8_K* y[R];
    for (int r = 0; r < R; ++r) y[r] = (const block_q8_K*) vy[r];
    const int nb = n / QK_K;
    const __m128i m4 = _mm_set1_epi8(0xf);
    const __m128i m1 = _mm_set1_epi8(1);
    const __m256i mask1 = _mm256_loadu_si256((const __m256i*) k_mask1);
    const __m256i mask2 = _mm256_loadu_si256((const __m256i*) k_mask2);
    uint64_t aux64;
    __m256 accumf[R];
    for (int r = 0; r < R; ++r) accumf[r] = _mm256_setzero_ps();
    for (int i = 0; i < nb; ++i) {
        const float dw = h2f(x[i].d);
        const uint8_t* STRATA_RESTRICT qs = x[i].qs;
        const uint8_t* STRATA_RESTRICT qh = x[i].qh;
        const uint16_t* STRATA_RESTRICT signs = (const uint16_t*) (x[i].qs + QK_K / 8);
        memcpy(&aux64, x[i].scales, 8);
        const __m128i scales8 = _mm_add_epi8(_mm_slli_epi16(_mm_and_si128(_mm_set_epi64x(aux64 >> 4, aux64), m4), 1), m1);
        const __m256i scales16 = _mm256_cvtepi8_epi16(scales8);
        __m256i sumi1[R], sumi2[R];
        for (int r = 0; r < R; ++r) sumi1[r] = sumi2[r] = _mm256_setzero_si256();
        for (int ib32 = 0; ib32 < QK_K / 32; ib32 += 2) {
            const __m256i q2_1 = _mm256_set_epi64x(iq2s_grid[qs[3] | ((qh[ib32 + 0] << 2) & 0x300)],
                                                   iq2s_grid[qs[2] | ((qh[ib32 + 0] << 4) & 0x300)],
                                                   iq2s_grid[qs[1] | ((qh[ib32 + 0] << 6) & 0x300)],
                                                   iq2s_grid[qs[0] | ((qh[ib32 + 0] << 8) & 0x300)]);
            const __m256i q2_2 = _mm256_set_epi64x(iq2s_grid[qs[7] | ((qh[ib32 + 1] << 2) & 0x300)],
                                                   iq2s_grid[qs[6] | ((qh[ib32 + 1] << 4) & 0x300)],
                                                   iq2s_grid[qs[5] | ((qh[ib32 + 1] << 6) & 0x300)],
                                                   iq2s_grid[qs[4] | ((qh[ib32 + 1] << 8) & 0x300)]);
            qs += 8;
            __m256i aux256 = _mm256_set1_epi32(signs[0] | ((uint32_t) signs[1] << 16));
            aux256 = _mm256_and_si256(_mm256_shuffle_epi8(aux256, mask1), mask2);
            const __m256i s2_1 = _mm256_cmpeq_epi8(aux256, mask2);
            aux256 = _mm256_set1_epi32(signs[2] | ((uint32_t) signs[3] << 16));
            aux256 = _mm256_and_si256(_mm256_shuffle_epi8(aux256, mask1), mask2);
            const __m256i s2_2 = _mm256_cmpeq_epi8(aux256, mask2);
            signs += 4;
            const __m256i sc1 = _mm256_shuffle_epi8(scales16, get_scale_shuffle_k4(ib32 + 0));
            const __m256i sc2 = _mm256_shuffle_epi8(scales16, get_scale_shuffle_k4(ib32 + 1));
            for (int r = 0; r < R; ++r) {
                const int8_t* STRATA_RESTRICT q8 = y[r][i].qs + ib32 * 32;
                const __m256i q8_1 = _mm256_loadu_si256((const __m256i*) q8);
                const __m256i q8_2 = _mm256_loadu_si256((const __m256i*) (q8 + 32));
                const __m256i q8s_1 = _mm256_sub_epi8(_mm256_xor_si256(s2_1, q8_1), s2_1);
                const __m256i q8s_2 = _mm256_sub_epi8(_mm256_xor_si256(s2_2, q8_2), s2_2);
                sumi1[r] = _mm256_add_epi32(sumi1[r], _mm256_madd_epi16(_mm256_maddubs_epi16(q2_1, q8s_1), sc1));
                sumi2[r] = _mm256_add_epi32(sumi2[r], _mm256_madd_epi16(_mm256_maddubs_epi16(q2_2, q8s_2), sc2));
            }
        }
        for (int r = 0; r < R; ++r) {
            const float d = dw * y[r][i].d;
            accumf[r] = _mm256_fmadd_ps(_mm256_set1_ps(d), _mm256_cvtepi32_ps(_mm256_add_epi32(sumi1[r], sumi2[r])),
                                        accumf[r]);
        }
    }
    for (int r = 0; r < R; ++r) s[r] = 0.125f * hsum_float_8(accumf[r]);
}

// dot_q3_K_q8_K for R rows: the low and high bits and the scales unpacked once a block, every row's products, sums
// and float sums the one-row function's.
template <int R>
void rows_q3_K_q8_K(int n, float* STRATA_RESTRICT s, const void* STRATA_RESTRICT vx, const void* const* vy) {
    const uint32_t kmask1 = 0x03030303;
    const uint32_t kmask2 = 0x0f0f0f0f;
    const block_q3_K* STRATA_RESTRICT x = (const block_q3_K*) vx;
    const block_q8_K* y[R];
    for (int r = 0; r < R; ++r) y[r] = (const block_q8_K*) vy[r];
    const int nb = n / QK_K;
    const __m256i m3 = _mm256_set1_epi8(3);
    const __m256i mone = _mm256_set1_epi8(1);
    const __m128i m32 = _mm_set1_epi8(32);
    __m256 acc[R];
    for (int r = 0; r < R; ++r) acc[r] = _mm256_setzero_ps();
    uint32_t aux[3];
    for (int i = 0; i < nb; ++i) {
        const float dw = h2f(x[i].d);
        const uint8_t* STRATA_RESTRICT q3 = x[i].qs;
        memcpy(aux, x[i].scales, 12);
        __m128i scales128 = _mm_set_epi32(((aux[1] >> 4) & kmask2) | (((aux[2] >> 6) & kmask1) << 4),
                                          ((aux[0] >> 4) & kmask2) | (((aux[2] >> 4) & kmask1) << 4),
                                          (aux[1] & kmask2) | (((aux[2] >> 2) & kmask1) << 4),
                                          (aux[0] & kmask2) | (((aux[2] >> 0) & kmask1) << 4));
        scales128 = _mm_sub_epi8(scales128, m32);
        const __m256i all_scales = _mm256_cvtepi8_epi16(scales128);
        const __m128i l_scales = _mm256_extracti128_si256(all_scales, 0);
        const __m128i h_scales = _mm256_extracti128_si256(all_scales, 1);
        const __m256i scales[2] = {MM256_SET_M128I(l_scales, l_scales), MM256_SET_M128I(h_scales, h_scales)};
        const __m256i hbits = _mm256_loadu_si256((const __m256i*) x[i].hmask);
        __m256i sumi[R];
        for (int r = 0; r < R; ++r) sumi[r] = _mm256_setzero_si256();
        int bit = 0;
        const int is = 0;   // as the one-row function has it: scales[j] is the half's, and its shuffles take 0..3
        for (int j = 0; j < QK_K / 128; ++j) {
            const __m256i q3bits = _mm256_loadu_si256((const __m256i*) q3);
            q3 += 32;
            const __m256i q3l_0 = _mm256_and_si256(q3bits, m3);
            const __m256i q3h_0 = _mm256_slli_epi16(_mm256_srli_epi16(_mm256_andnot_si256(hbits, _mm256_slli_epi16(mone, bit)), bit), 2);
            ++bit;
            const __m256i q3l_1 = _mm256_and_si256(_mm256_srli_epi16(q3bits, 2), m3);
            const __m256i q3h_1 = _mm256_slli_epi16(_mm256_srli_epi16(_mm256_andnot_si256(hbits, _mm256_slli_epi16(mone, bit)), bit), 2);
            ++bit;
            const __m256i q3l_2 = _mm256_and_si256(_mm256_srli_epi16(q3bits, 4), m3);
            const __m256i q3h_2 = _mm256_slli_epi16(_mm256_srli_epi16(_mm256_andnot_si256(hbits, _mm256_slli_epi16(mone, bit)), bit), 2);
            ++bit;
            const __m256i q3l_3 = _mm256_and_si256(_mm256_srli_epi16(q3bits, 6), m3);
            const __m256i q3h_3 = _mm256_slli_epi16(_mm256_srli_epi16(_mm256_andnot_si256(hbits, _mm256_slli_epi16(mone, bit)), bit), 2);
            ++bit;
            const __m256i sc0 = _mm256_shuffle_epi8(scales[j], get_scale_shuffle_q3k(is + 0));
            const __m256i sc1 = _mm256_shuffle_epi8(scales[j], get_scale_shuffle_q3k(is + 1));
            const __m256i sc2 = _mm256_shuffle_epi8(scales[j], get_scale_shuffle_q3k(is + 2));
            const __m256i sc3 = _mm256_shuffle_epi8(scales[j], get_scale_shuffle_q3k(is + 3));
            for (int r = 0; r < R; ++r) {
                const int8_t* STRATA_RESTRICT q8 = y[r][i].qs + j * 128;
                const __m256i q8_0 = _mm256_loadu_si256((const __m256i*) q8);
                const __m256i q8_1 = _mm256_loadu_si256((const __m256i*) (q8 + 32));
                const __m256i q8_2 = _mm256_loadu_si256((const __m256i*) (q8 + 64));
                const __m256i q8_3 = _mm256_loadu_si256((const __m256i*) (q8 + 96));
                __m256i p16_0 = _mm256_sub_epi16(_mm256_maddubs_epi16(q3l_0, q8_0), _mm256_maddubs_epi16(q3h_0, q8_0));
                __m256i p16_1 = _mm256_sub_epi16(_mm256_maddubs_epi16(q3l_1, q8_1), _mm256_maddubs_epi16(q3h_1, q8_1));
                __m256i p16_2 = _mm256_sub_epi16(_mm256_maddubs_epi16(q3l_2, q8_2), _mm256_maddubs_epi16(q3h_2, q8_2));
                __m256i p16_3 = _mm256_sub_epi16(_mm256_maddubs_epi16(q3l_3, q8_3), _mm256_maddubs_epi16(q3h_3, q8_3));
                p16_0 = _mm256_madd_epi16(sc0, p16_0);
                p16_1 = _mm256_madd_epi16(sc1, p16_1);
                p16_2 = _mm256_madd_epi16(sc2, p16_2);
                p16_3 = _mm256_madd_epi16(sc3, p16_3);
                p16_0 = _mm256_add_epi32(p16_0, p16_1);
                p16_2 = _mm256_add_epi32(p16_2, p16_3);
                sumi[r] = _mm256_add_epi32(sumi[r], _mm256_add_epi32(p16_0, p16_2));
            }
        }
        for (int r = 0; r < R; ++r) {
            const float d = y[r][i].d * dw;
            acc[r] = _mm256_fmadd_ps(_mm256_broadcast_ss(&d), _mm256_cvtepi32_ps(sumi[r]), acc[r]);
        }
    }
    for (int r = 0; r < R; ++r) s[r] = hsum_float_8(acc[r]);
}

// R rows at a time, 4 at most, by the one-row kernel for a last row alone
template <void (*Two)(int, float*, const void*, const void* const*), void (*Three)(int, float*, const void*, const void* const*),
          void (*Four)(int, float*, const void*, const void* const*), void (*One)(int, float*, const void*, const void*)>
void rows_by_four(int n, int rows, float* s, const void* w, const void* const* a) {
    for (; rows >= 4; rows -= 4, s += 4, a += 4) Four(n, s, w, a);
    switch (rows) {
    case 3: Three(n, s, w, a); break;
    case 2: Two(n, s, w, a); break;
    case 1: One(n, s, w, a[0]); break;
    default: break;
    }
}

}  // namespace avx2

DotRowsFn avx2_dot_rows(Type w) noexcept {
    using namespace avx2;
    switch (w) {
    case Type::IQ3_XXS:
        return rows_by_four<rows_iq3_xxs_q8_K<2>, rows_iq3_xxs_q8_K<3>, rows_iq3_xxs_q8_K<4>, dot_iq3_xxs_q8_K>;
    case Type::IQ2_XXS:
        return rows_by_four<rows_iq2_xxs_q8_K<2>, rows_iq2_xxs_q8_K<3>, rows_iq2_xxs_q8_K<4>, dot_iq2_xxs_q8_K>;
    case Type::IQ2_S:
        return rows_by_four<rows_iq2_s_q8_K<2>, rows_iq2_s_q8_K<3>, rows_iq2_s_q8_K<4>, dot_iq2_s_q8_K>;
    case Type::Q3_K:
        return rows_by_four<rows_q3_K_q8_K<2>, rows_q3_K_q8_K<3>, rows_q3_K_q8_K<4>, dot_q3_K_q8_K>;
    default:
        return nullptr;
    }
}

namespace {
#define ENTRY(T, ACT, NAME) {avx2::dot_##NAME, Type::T, Type::ACT, Arith::Avx2, Isa::Avx2, "avx2_" #NAME}
const DotKernel kTable[] = {
    ENTRY(Q4_0, Q8_0, q4_0_q8_0),   ENTRY(Q4_1, Q8_1, q4_1_q8_1),   ENTRY(Q5_0, Q8_0, q5_0_q8_0),   ENTRY(Q5_1, Q8_1, q5_1_q8_1),
    ENTRY(Q8_0, Q8_0, q8_0_q8_0),   ENTRY(IQ4_NL, Q8_0, iq4_nl_q8_0), ENTRY(MXFP4, Q8_0, mxfp4_q8_0), ENTRY(NVFP4, Q8_0, nvfp4_q8_0),
    ENTRY(Q2_K, Q8_K, q2_K_q8_K),   ENTRY(Q3_K, Q8_K, q3_K_q8_K),   ENTRY(Q4_K, Q8_K, q4_K_q8_K),   ENTRY(Q5_K, Q8_K, q5_K_q8_K),
    ENTRY(Q6_K, Q8_K, q6_K_q8_K),   ENTRY(IQ1_S, Q8_K, iq1_s_q8_K),  ENTRY(IQ1_M, Q8_K, iq1_m_q8_K),  ENTRY(IQ2_XXS, Q8_K, iq2_xxs_q8_K),
    ENTRY(IQ2_XS, Q8_K, iq2_xs_q8_K), ENTRY(IQ2_S, Q8_K, iq2_s_q8_K), ENTRY(IQ3_XXS, Q8_K, iq3_xxs_q8_K), ENTRY(IQ3_S, Q8_K, iq3_s_q8_K),
    ENTRY(IQ4_XS, Q8_K, iq4_xs_q8_K),
    {generic::dot_q2_0_q8_0_generic, Type::Q2_0, Type::Q8_0, Arith::Avx2, Isa::Scalar, "avx2_q2_0_generic"},
};
#undef ENTRY
}  // namespace

DotTable avx2_dot_table() noexcept { return {kTable, (int) (sizeof kTable / sizeof kTable[0])}; }

}  // namespace strata::quant
