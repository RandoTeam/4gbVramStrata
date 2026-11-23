// src/fourgbvram/bell_test.cu - ExpertBell system-scope atomics, multi-row hand-off, abort release, and
// null-slot early exit in native_mmvq_ids().  Needs a CUDA card (77 when none is present).
#include "strata/fourgbvram/kernels.hpp"
#include "strata/kernels/native_mmvq.hpp"

#include <cuda_runtime.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <thread>
#include <vector>

namespace {

using namespace strata::fourgbvram;
using Clock = std::chrono::steady_clock;
using namespace std::chrono_literals;

void ck(cudaError_t e, const char* what) {
    if (e != cudaSuccess) {
        std::fprintf(stderr, "fourgbvram_bell_test: %s: %s\n", what, cudaGetErrorString(e));
        std::exit(1);
    }
}

class Watchdog {
public:
    Watchdog()
        : th_([this] {
              std::unique_lock<std::mutex> lk(mu_);
              if (cv_.wait_for(lk, 30s, [&] { return done_; })) return;
              if (bell_) std::atomic_ref<uint32_t>(bell_->abort).store(1, std::memory_order_release);
              std::fprintf(stderr, "fourgbvram_bell_test: timeout waiting for doorbell\n");
              std::_Exit(1);
          }) {}
    ~Watchdog() {
        {
            std::lock_guard<std::mutex> lk(mu_);
            done_ = true;
        }
        cv_.notify_one();
        th_.join();
    }
    void set(ExpertBell* b) {
        std::lock_guard<std::mutex> lk(mu_);
        bell_ = b;
    }

private:
    std::mutex mu_;
    std::condition_variable cv_;
    ExpertBell* bell_ = nullptr;
    bool done_ = false;
    std::thread th_;
};

cudaError_t wait_stream(cudaStream_t s, Clock::duration limit) {
    const auto end = Clock::now() + limit;
    while (Clock::now() < end) {
        const cudaError_t q = cudaStreamQuery(s);
        if (q != cudaErrorNotReady) return q;
        std::this_thread::sleep_for(100us);
    }
    return cudaErrorNotReady;
}

void test_bell_handoff(Watchdog& wd, cudaStream_t s) {
    constexpr int kRows = 4, kUsed = 4, kDim = 256, kExperts = 8;
    ExpertBell* bell = nullptr;
    float *hx = nullptr, *hy = nullptr;
    ck(cudaHostAlloc((void**) &bell, sizeof(ExpertBell), cudaHostAllocMapped), "alloc bell");
    *bell = ExpertBell{};
    wd.set(bell);
    ck(cudaHostAlloc((void**) &hx, (size_t) kRows * kDim * sizeof(float), cudaHostAllocMapped), "alloc hx");
    ck(cudaHostAlloc((void**) &hy, (size_t) kRows * kDim * sizeof(float), cudaHostAllocMapped), "alloc hy");

    void** d_slots = nullptr;
    int32_t* d_ids = nullptr;
    float *d_w = nullptr, *d_x = nullptr, *d_acc = nullptr;
    uint32_t* d_seq = nullptr;
    ck(cudaMalloc(&d_slots, kExperts * sizeof(void*)), "d_slots");
    ck(cudaMalloc(&d_ids, kRows * kUsed * sizeof(int32_t)), "d_ids");
    ck(cudaMalloc(&d_w, kRows * kUsed * sizeof(float)), "d_w");
    ck(cudaMalloc(&d_x, (size_t) kRows * kDim * sizeof(float)), "d_x");
    ck(cudaMalloc(&d_acc, (size_t) kRows * kDim * sizeof(float)), "d_acc");
    ck(cudaMalloc(&d_seq, 3 * sizeof(uint32_t)), "d_seq");
    ck(cudaMemset(d_seq, 0, 3 * sizeof(uint32_t)), "zero seq");

    void* h_slots[kExperts] = {};
    h_slots[0] = (void*) 0x1000;
    h_slots[1] = (void*) 0x2000;   // experts 0 and 1 are in VRAM; 2..7 on CPU
    ck(cudaMemcpy(d_slots, h_slots, sizeof(h_slots), cudaMemcpyHostToDevice), "copy slots");

    // 1. Multi-row ring + cross-row tail_skip=2:
    // Row 0: [0, 1, 5, 4] -> 5, 4 at rank >= 2, EXCEPT 4 appears at rank 0 in Row 2! So Row 0 keeps 4, skips 5.
    // Row 1: [0, 1, 0, 1] -> all in VRAM -> skipped from hx copy!
    // Row 2: [4, 2, 7, 1] -> skips 7 (only rank 2), keeps 4 (rank 0) and 2 (rank 1).
    // Row 3: [3, 1, 0, 6] -> keeps 3 (rank 0), skips 6 (rank 3).
    const int32_t h_ids[kRows * kUsed] = {
        0, 1, 5, 4,
        0, 1, 0, 1,
        4, 2, 7, 1,
        3, 1, 0, 6,
    };
    std::vector<float> h_w(kRows * kUsed), h_x(kRows * kDim), h_acc(kRows * kDim, 10.f);
    for (int i = 0; i < kRows * kUsed; ++i) h_w[i] = 0.25f * (float) (i + 1);
    for (int i = 0; i < kRows * kDim; ++i) h_x[i] = (float) ((i % 97) - 40);
    for (int i = 0; i < kRows * kDim; ++i) hx[i] = -777.f;
    ck(cudaMemcpy(d_ids, h_ids, sizeof(h_ids), cudaMemcpyHostToDevice), "copy ids");
    ck(cudaMemcpy(d_w, h_w.data(), h_w.size() * sizeof(float), cudaMemcpyHostToDevice), "copy w");
    ck(cudaMemcpy(d_x, h_x.data(), h_x.size() * sizeof(float), cudaMemcpyHostToDevice), "copy x");
    ck(cudaMemcpy(d_acc, h_acc.data(), h_acc.size() * sizeof(float), cudaMemcpyHostToDevice), "copy acc");

    bell_ring(d_slots, d_ids, d_w, kUsed, 2, 17, d_x, hx, kDim, kRows, bell, d_seq, s);
    bell_add(bell, d_seq, hy, d_acc, kDim, kRows, s);

    std::atomic_ref<uint32_t> ring(bell->ring), ack(bell->ack), abort(bell->abort);
    const auto t0 = Clock::now();
    uint32_t r = 0;
    while ((r = ring.load(std::memory_order_acquire)) == 0) {
        if (Clock::now() - t0 > 5s) {
            std::fprintf(stderr, "fourgbvram_bell_test: ring did not arrive\n");
            std::_Exit(1);
        }
    }
    if (bell->layer != 17 || bell->rows != kRows || bell->n != 4 ||
        bell->e[0] != 4 || bell->row[0] != 0 ||
        bell->e[1] != 4 || bell->row[1] != 2 ||
        bell->e[2] != 2 || bell->row[2] != 2 ||
        bell->e[3] != 3 || bell->row[3] != 3) {
        std::fprintf(stderr, "fourgbvram_bell_test: wrong bell jobs (layer=%d rows=%d n=%d)\n", bell->layer, bell->rows,
                     bell->n);
        std::_Exit(1);
    }
    for (int i = 0; i < kDim; ++i) {
        if (hx[i] != h_x[i] || hx[kDim + i] != -777.f || hx[2 * kDim + i] != h_x[2 * kDim + i] ||
            hx[3 * kDim + i] != h_x[3 * kDim + i]) {
            std::fprintf(stderr, "fourgbvram_bell_test: hx mismatch at %d\n", i);
            std::_Exit(1);
        }
        hy[i] = 1.f;
        hy[kDim + i] = 999.f;   // inactive row must not be added
        hy[2 * kDim + i] = 2.f;
        hy[3 * kDim + i] = 3.f;
    }
    ack.store(r, std::memory_order_release);
    ck(wait_stream(s, 5s), "wait handoff");
    ck(cudaMemcpy(h_acc.data(), d_acc, h_acc.size() * sizeof(float), cudaMemcpyDeviceToHost), "read acc");
    const float want_row[kRows] = {11.f, 10.f, 12.f, 13.f};
    for (int row = 0; row < kRows; ++row)
        for (int i = 0; i < kDim; ++i)
            if (std::fabs(h_acc[(size_t) row * kDim + i] - want_row[row]) > 1e-6f) {
                std::fprintf(stderr, "fourgbvram_bell_test: acc mismatch row %d idx %d: %g vs %g\n", row, i,
                             h_acc[(size_t) row * kDim + i], want_row[row]);
                std::_Exit(1);
            }

    // 2. Zero-miss fast path: all picks in VRAM -> ring stays `r`, acc untouched
    const int32_t all_vram[kUsed] = {0, 1, 0, 1};
    ck(cudaMemcpy(d_ids, all_vram, sizeof(all_vram), cudaMemcpyHostToDevice), "copy all_vram");
    bell_ring(d_slots, d_ids, d_w, kUsed, kUsed, 3, d_x, hx, kDim, 1, bell, d_seq, s);
    bell_add(bell, d_seq, hy, d_acc, kDim, 1, s);
    ck(wait_stream(s, 5s), "wait zero-miss");
    if (ring.load(std::memory_order_acquire) != r) {
        std::fprintf(stderr, "fourgbvram_bell_test: zero-miss rang unexpectedly\n");
        std::_Exit(1);
    }

    // 3. Abort releases stalled waiter without touching acc
    const int32_t miss_one[kUsed] = {2, 0, 1, 0};
    ck(cudaMemcpy(d_ids, miss_one, sizeof(miss_one), cudaMemcpyHostToDevice), "copy miss_one");
    bell_ring(d_slots, d_ids, d_w, kUsed, kUsed, 4, d_x, hx, kDim, 1, bell, d_seq, s);
    bell_add(bell, d_seq, hy, d_acc, kDim, 1, s);
    const auto t1 = Clock::now();
    while (ring.load(std::memory_order_acquire) == r) {
        if (Clock::now() - t1 > 5s) {
            std::fprintf(stderr, "fourgbvram_bell_test: second ring did not arrive\n");
            std::_Exit(1);
        }
    }
    abort.store(1, std::memory_order_release);
    ck(wait_stream(s, 5s), "wait abort");
    ck(cudaMemcpy(h_acc.data(), d_acc, (size_t) kDim * sizeof(float), cudaMemcpyDeviceToHost), "read acc abort");
    for (int i = 0; i < kDim; ++i)
        if (h_acc[i] != 11.f) {
            std::fprintf(stderr, "fourgbvram_bell_test: aborted wait mutated acc\n");
            std::_Exit(1);
        }

    // 4. Pre-aborted bell skips ringing and leaves acc untouched
    const uint32_t r2 = ring.load(std::memory_order_acquire);
    bell_ring(d_slots, d_ids, d_w, kUsed, kUsed, 5, d_x, hx, kDim, 1, bell, d_seq, s);
    bell_add(bell, d_seq, hy, d_acc, kDim, 1, s);
    ck(wait_stream(s, 5s), "wait pre-aborted");
    if (ring.load(std::memory_order_acquire) != r2) {
        std::fprintf(stderr, "fourgbvram_bell_test: pre-aborted bell rang\n");
        std::_Exit(1);
    }

    wd.set(nullptr);
    ck(cudaFree(d_seq), "free d_seq");
    ck(cudaFree(d_acc), "free d_acc");
    ck(cudaFree(d_x), "free d_x");
    ck(cudaFree(d_w), "free d_w");
    ck(cudaFree(d_ids), "free d_ids");
    ck(cudaFree(d_slots), "free d_slots");
    ck(cudaFreeHost(hy), "free hy");
    ck(cudaFreeHost(hx), "free hx");
    ck(cudaFreeHost(bell), "free bell");
}

void test_null_slot_mmvq(cudaStream_t s) {
    namespace sk = strata::kernels;
    constexpr int kIn = 256, kOut = 64, kSlots = 3, kPicks = 3;
    // Q8_0: 8; Q4_K: 12; IQ2_XXS: 16 (mmvq_slots_staged_kernel + mmvq_slots_kernel); IQ3_XXS: 18 (mmvq_slots_iq3_kernel + mmvq_slots_kernel)
    const int types[] = {8, 12, 16, 18};
    const size_t q81_bytes = sk::native_q8_1_bytes(kIn);
    void* d_xq = nullptr;
    float *d_x = nullptr, *d_y = nullptr, *d_ref = nullptr;
    int32_t* d_ids = nullptr;
    void** d_table = nullptr;
    ck(cudaMalloc(&d_x, kIn * sizeof(float)), "mmvq d_x");
    ck(cudaMalloc(&d_xq, q81_bytes), "mmvq d_xq");
    ck(cudaMalloc(&d_y, kPicks * kOut * sizeof(float)), "mmvq d_y");
    ck(cudaMalloc(&d_ref, kOut * sizeof(float)), "mmvq d_ref");
    ck(cudaMalloc(&d_ids, kPicks * sizeof(int32_t)), "mmvq d_ids");
    ck(cudaMalloc(&d_table, kSlots * sizeof(void*)), "mmvq d_table");

    std::vector<float> h_x(kIn);
    for (int i = 0; i < kIn; ++i) h_x[i] = 0.05f * (float) ((i % 19) - 9);
    ck(cudaMemcpy(d_x, h_x.data(), h_x.size() * sizeof(float), cudaMemcpyHostToDevice), "copy x");
    sk::native_quantize_q8_1(d_x, d_xq, kIn, 1, s);

    const int32_t h_ids[kPicks] = {0, 1, 2};   // expert 1 is null
    ck(cudaMemcpy(d_ids, h_ids, sizeof(h_ids), cudaMemcpyHostToDevice), "copy ids");

    for (int ty : types) {
        const size_t bytes = sk::native_mmvq_weight_bytes(ty, kIn, kOut);
        void *w0 = nullptr, *w2 = nullptr;
        ck(cudaMalloc(&w0, bytes), "w0");
        ck(cudaMalloc(&w2, bytes), "w2");
        std::vector<uint8_t> buf0(bytes), buf2(bytes);
        for (size_t i = 0; i < bytes; ++i) {
            const uint8_t v0 = (uint8_t) ((i * 37 + 11) & 0x7f);
            const uint8_t v2 = (uint8_t) ((i * 53 + 29) & 0x7f);
            // Keep high bytes of potential FP16 block scales in [0x20, 0x3f] so no block ever encodes Inf/NaN.
            buf0[i] = (i & 1) ? (uint8_t) ((v0 & 0x1f) | 0x20) : v0;
            buf2[i] = (i & 1) ? (uint8_t) ((v2 & 0x1f) | 0x20) : v2;
        }
        ck(cudaMemcpy(w0, buf0.data(), bytes, cudaMemcpyHostToDevice), "copy w0");
        ck(cudaMemcpy(w2, buf2.data(), bytes, cudaMemcpyHostToDevice), "copy w2");
        void* h_table[kSlots] = {w0, nullptr, w2};
        ck(cudaMemcpy(d_table, h_table, sizeof(h_table), cudaMemcpyHostToDevice), "copy table");

        for (bool lanes : {false, true}) {
            if (ty != 16 && ty != 18 && lanes) continue;
            // Poison output buffer before launch to catch unzeroed null slots
            std::vector<float> poison(kPicks * kOut, 1234.5f);
            ck(cudaMemcpy(d_y, poison.data(), poison.size() * sizeof(float), cudaMemcpyHostToDevice), "poison y");
            sk::MmvqIds req{d_table, d_ids, 0, d_xq, q81_bytes, kPicks, d_y, (size_t) kOut, lanes};
            if (!sk::native_mmvq_ids(ty, req, kPicks, kIn, kOut, s)) {
                std::fprintf(stderr, "fourgbvram_bell_test: native_mmvq_ids(%d) failed\n", ty);
                std::_Exit(1);
            }
            sk::native_mmvq(ty, w0, d_xq, d_ref, kIn, kOut, 1, s);
            ck(cudaStreamSynchronize(s), "sync mmvq");
            std::vector<float> got(kPicks * kOut), ref(kOut);
            ck(cudaMemcpy(got.data(), d_y, got.size() * sizeof(float), cudaMemcpyDeviceToHost), "read y");
            ck(cudaMemcpy(ref.data(), d_ref, ref.size() * sizeof(float), cudaMemcpyDeviceToHost), "read ref");
            for (int r = 0; r < kOut; ++r) {
                if (got[r] != ref[r] || got[kOut + r] != 0.0f) {
                    std::fprintf(stderr, "fourgbvram_bell_test: null-slot mismatch type=%d lanes=%d row=%d (%g vs %g, null=%g)\n",
                                 ty, (int) lanes, r, got[r], ref[r], got[kOut + r]);
                    std::_Exit(1);
                }
            }
        }
        ck(cudaFree(w0), "free w0");
        ck(cudaFree(w2), "free w2");
    }

    ck(cudaFree(d_table), "free table");
    ck(cudaFree(d_ids), "free ids");
    ck(cudaFree(d_ref), "free ref");
    ck(cudaFree(d_y), "free y");
    ck(cudaFree(d_xq), "free xq");
    ck(cudaFree(d_x), "free x");
}

}  // namespace

int main() {
    int devs = 0;
    if (cudaGetDeviceCount(&devs) != cudaSuccess || devs <= 0) return 77;
    Watchdog wd;
    cudaStream_t s = nullptr;
    ck(cudaStreamCreateWithFlags(&s, cudaStreamNonBlocking), "create stream");
    test_bell_handoff(wd, s);
    test_null_slot_mmvq(s);
    ck(cudaStreamDestroy(s), "destroy stream");
    std::printf("fourgbvram_bell_test: ok\n");
    return 0;
}
