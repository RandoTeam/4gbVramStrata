// src/fourgbvram/mmq_k32_test.cu - the int8 prompt product (mmq_own.cu, i8_mma.cuh) for a matrix of 32-value blocks whose rows
// end inside a stage of 256 values (Gemma 4 26B's down: 704 values), against the same matrix with each row padded to
// the next whole stage by blocks of zeros (scale 0), times rows padded with zeros: the padding adds nothing, so the two
// must agree to the bit.  The unpadded matrices are allocated to their last byte, so that a read past them shows
// under compute-sanitizer.  Q4_0's products are checked against its weights' values as well.
//
// usage: fourgbvram_mmq_k32_test   (exit 0: every case agrees; 77: no card, or no int8 product on it)
#include "mmq.hpp"

#include <cuda_runtime.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <random>
#include <vector>

using strata::fourgbvram::Mmq;

namespace {

struct Quant { const char* name; int type; int block; };   // ggml_type, bytes of a block of 32 values
constexpr Quant kQuants[] = {{"Q4_0", 2, 18}, {"Q5_0", 6, 22}, {"Q5_1", 7, 24}, {"Q8_0", 8, 34}, {"IQ4_NL", 20, 18}};
constexpr int kRows = 200;   // weight rows a matrix: not a whole number of the kernel's tiles of 64

bool ok(cudaError_t e, const char* what) {
    if (e != cudaSuccess) std::printf("%s: %s\n", what, cudaGetErrorString(e));
    return e == cudaSuccess;
}

float half_to_float(uint16_t h) {
    const int e = (h >> 10) & 31, m = h & 1023;
    const float v = e == 0 ? std::ldexp((float) m, -24) : std::ldexp((float) (m | 1024), e - 25);
    return (h & 0x8000) ? -v : v;
}

// Q4_0 has no other test of its int8 decode: each product against the weights' values (scale * (nibble - 8), the low
// nibbles first) times the rows as floats, within the int8 rows' rounding (1% of the sum of the terms' sizes)
int q4_0_misses(const std::vector<uint8_t>& w, const std::vector<float>& x, const std::vector<float>& y, int k,
                const std::vector<int32_t>& bounds) {
    const int nb = k / 32;
    int bad = 0;
    for (size_t e = 0; e + 1 < bounds.size(); ++e)
        for (int t = bounds[e]; t < bounds[e + 1]; ++t)
            for (int r = 0; r < kRows; ++r) {
                double sum = 0, size = 0;
                for (int b = 0; b < nb; ++b) {
                    const uint8_t* p = &w[(e * kRows + (size_t) r) * nb * 18 + (size_t) b * 18];
                    const float d = half_to_float((uint16_t) (p[0] | p[1] << 8));
                    for (int j = 0; j < 32; ++j) {
                        const int q = (j < 16 ? p[2 + j] & 15 : p[2 + j - 16] >> 4) - 8;
                        const double v = (double) d * q * x[(size_t) t * k + 32 * b + j];
                        sum += v;
                        size += std::fabs(v);
                    }
                }
                bad += std::fabs(y[(size_t) t * kRows + r] - sum) > 0.01 * size + 1e-6;
            }
    return bad;
}

// n matrices of kRows rows of k values; returns how many output values differ from the padded run, -1 on an error
int run_case(const Quant& q, int k, int n, const std::vector<int>& rows, std::mt19937& rng) {
    const int kp = (k + 255) / 256 * 256, nb = k / 32, nbp = kp / 32;
    const size_t mat = (size_t) kRows * nb * q.block, matp = (size_t) kRows * nbp * q.block;
    std::vector<uint8_t> w(mat * n), wp(matp * n, 0);
    for (auto& b : w) b = (uint8_t) rng();
    for (size_t b = 0; b < w.size() / q.block; ++b) {   // finite scales (and Q5_1's minimum): halves of about 2^-3
        uint8_t* p = &w[b * q.block];
        p[0] = (uint8_t) rng(); p[1] = 0x30;
        if (q.type == 7) { p[2] = (uint8_t) rng(); p[3] = 0x30; }
    }
    for (int e = 0; e < n; ++e)
        for (int r = 0; r < kRows; ++r)
            std::memcpy(&wp[e * matp + (size_t) r * nbp * q.block], &w[e * mat + (size_t) r * nb * q.block], (size_t) nb * q.block);
    int total = 0;
    std::vector<int32_t> bounds(1, 0);
    for (int e = 0; e < n; ++e) bounds.push_back(total += rows[(size_t) e]);
    int most = 0;
    for (int r : rows) most = std::max(most, r);
    std::vector<float> x((size_t) total * k), xp((size_t) total * kp, 0.f);
    for (int t = 0; t < total; ++t)
        for (int c = 0; c < k; ++c) xp[(size_t) t * kp + c] = x[(size_t) t * k + c] = (float) ((rng() & 0xffff) / 16384.0 - 2.0);

    uint8_t *dw = nullptr, *dwp = nullptr;
    float *dx = nullptr, *dxp = nullptr, *dy = nullptr, *dyp = nullptr;
    int32_t* db = nullptr;
    void *xq = nullptr, *xqp = nullptr;
    int bad = -1;
    if (ok(cudaMalloc(&dw, w.size()), "w") && ok(cudaMalloc(&dwp, wp.size()), "wp") &&
        ok(cudaMalloc(&dx, x.size() * 4), "x") && ok(cudaMalloc(&dxp, xp.size() * 4), "xp") &&
        ok(cudaMalloc(&db, bounds.size() * 4), "bounds") && ok(cudaMalloc(&xq, Mmq::q8_bytes(total, k)), "xq") &&
        ok(cudaMalloc(&xqp, Mmq::q8_bytes(total, kp)), "xqp") &&
        ok(cudaMalloc(&dy, (size_t) total * kRows * 4), "y") && ok(cudaMalloc(&dyp, (size_t) total * kRows * 4), "yp")) {
        cudaMemcpy(dw, w.data(), w.size(), cudaMemcpyHostToDevice);
        cudaMemcpy(dwp, wp.data(), wp.size(), cudaMemcpyHostToDevice);
        cudaMemcpy(dx, x.data(), x.size() * 4, cudaMemcpyHostToDevice);
        cudaMemcpy(dxp, xp.data(), xp.size() * 4, cudaMemcpyHostToDevice);
        cudaMemcpy(db, bounds.data(), bounds.size() * 4, cudaMemcpyHostToDevice);
        Mmq mmq;
        mmq.mirror(db, bounds.data(), bounds.size() * 4);
        mmq.quantize(dx, nullptr, xq, q.type, k, k, total, nullptr);
        mmq.mul(dw, q.type, kRows, k, mat, n, xq, db, nullptr, total, most, dy, kRows, nullptr);
        mmq.quantize(dxp, nullptr, xqp, q.type, kp, kp, total, nullptr);
        mmq.mul(dwp, q.type, kRows, kp, matp, n, xqp, db, nullptr, total, most, dyp, kRows, nullptr);
        if (ok(cudaDeviceSynchronize(), "run")) {
            std::vector<float> a((size_t) total * kRows), b(a.size());
            cudaMemcpy(a.data(), dy, a.size() * 4, cudaMemcpyDeviceToHost);
            cudaMemcpy(b.data(), dyp, b.size() * 4, cudaMemcpyDeviceToHost);
            bad = 0;
            for (size_t i = 0; i < a.size(); ++i) bad += std::memcmp(&a[i], &b[i], 4) != 0;
            if (q.type == 2) bad += q4_0_misses(w, x, a, k, bounds);
        }
    }
    for (void* p : {(void*) dw, (void*) dwp, (void*) dx, (void*) dxp, (void*) db, xq, xqp, (void*) dy, (void*) dyp})
        if (p) cudaFree(p);
    return bad;
}

}  // namespace

int main() {
    int devices = 0;
    if (cudaGetDeviceCount(&devices) != cudaSuccess || devices == 0) {
        std::printf("no card: skipped\n");
        return 77;
    }
    std::mt19937 rng(11);
    int failures = 0, cases = 0, ran = 0;
    for (const Quant& q : kQuants) {
        for (int k : {704, 288, 32, 512}) {   // Gemma 4's down; a stage and a block; one block; whole stages
            if (!Mmq::reads_by_index(q.type, k)) {   // the int8 product's own test (mmq_own.cu: int8_rows())
                std::printf("%s K=%d: no int8 product on this card, not checked\n", q.name, k);
                continue;
            }
            for (const std::vector<int>& rows : {std::vector<int>{1}, std::vector<int>{3, 0, 40, 17, 129, 1}}) {
                const int bad = run_case(q, k, (int) rows.size(), rows, rng);
                ++cases;
                ran = 1;
                if (bad != 0) {
                    ++failures;
                    std::printf("FAIL %s K=%d, %zu matrices: %d values differ from the padded run\n", q.name, k,
                                rows.size(), bad);
                }
            }
        }
    }
    if (!ran) return 77;
    if (failures) {
        std::printf("FAIL: %d of %d cases\n", failures, cases);
        return 1;
    }
    std::printf("PASS cases=%d\n", cases);
    return 0;
}
