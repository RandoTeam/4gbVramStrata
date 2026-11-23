// src/quant/dispatch.cpp - kernel lookup: the best kernel of an arithmetic contract that this CPU can run.
#include <algorithm>

#include "registry.hpp"
#include "strata/quant/act.hpp"
#include "strata/quant/dot.hpp"

namespace strata::quant {
namespace {

template <typename K, typename T, int N>
int gather(const T (&tables)[N], Type t, Arith a, const K** out, int cap, Type K::*field) {
    int n = 0;
    for (const T& tb : tables)
        for (int i = 0; i < tb.n; ++i) {
            const K& k = tb.v[i];
            if (k.*field == t && k.arith == a && n < cap) out[n++] = &k;
        }
    // best (widest hardware) first
    std::stable_sort(out, out + n, [](const K* x, const K* y) { return (int) x->isa > (int) y->isa; });
    return n;
}

constexpr int kMaxK = 16;

int collect_dots(Type w, Arith a, const DotKernel** out, int cap) {
    const DotTable tables[] = {
        generic_dot_table(),
#ifdef STRATA_QUANT_X86_TIERS
        avx_dot_table(), avx2_dot_table(), avx512_dot_table(),
#endif
#ifdef STRATA_QUANT_AVXVNNI
        avxvnni_dot_table(),
#endif
#ifdef STRATA_QUANT_ARM_TIERS
        neon_dot_table(),
#endif
    };
    return gather(tables, w, a, out, cap, &DotKernel::weight);
}

int collect_acts(Type act, Arith a, const ActKernel** out, int cap) {
    const ActTable tables[] = {
        generic_act_table(),
#ifdef STRATA_QUANT_X86_TIERS
        avx_act_table(), avx2_act_table(),
#endif
#ifdef STRATA_QUANT_ARM_TIERS
        neon_act_table(),
#endif
    };
    return gather(tables, act, a, out, cap, &ActKernel::act);
}

}  // namespace

int dot_kernels(Type w, Arith a, const DotKernel** out, int cap) noexcept { return collect_dots(w, a, out, cap); }

const DotKernel* dot_kernel(Type w, Arith a, Isa max_isa) noexcept {
    const DotKernel* v[kMaxK];
    const int n = collect_dots(w, a, v, kMaxK);
    for (int i = 0; i < n; ++i)
        if ((int) v[i]->isa <= (int) max_isa && isa_ok(v[i]->isa)) return v[i];
    return nullptr;
}

const DotKernel* dot_kernel(Type w, Arith a) noexcept { return dot_kernel(w, a, best_isa()); }

DotRowsFn dot_rows_kernel(Type w, Arith a) noexcept {
#ifdef STRATA_QUANT_X86_TIERS
    if (a == Arith::Avx2 && isa_ok(Isa::Avx2)) return avx2_dot_rows(w);
#endif
    (void) w, (void) a;
    return nullptr;
}

const DotX4Kernel* dot_x4_kernel(Type w, Arith a, Isa max_isa) noexcept {
#ifdef STRATA_QUANT_X86_TIERS
    const DotX4Table tb = avx2_dot_x4_table();
    const DotX4Kernel* best = nullptr;
    for (int i = 0; i < tb.n; ++i) {
        const DotX4Kernel& k = tb.v[i];
        if (k.weight == w && k.arith == a && (int) k.isa <= (int) max_isa && isa_ok(k.isa)) {
            if (!best || (int) k.isa > (int) best->isa) best = &k;
        }
    }
    return best;
#else
    (void) w, (void) a, (void) max_isa;
    return nullptr;
#endif
}

const DotX4Kernel* dot_x4_kernel(Type w, Arith a) noexcept { return dot_x4_kernel(w, a, best_isa()); }

bool nvfp4_gu_rows(Arith a, const uint8_t* gate, size_t g_row, const uint8_t* up, size_t u_row, int n,
                   const void* const* act, int nt, float* g_out, float* u_out, int r0, int r1) noexcept {
#ifdef STRATA_QUANT_X86_TIERS
    if (a == Arith::Avx2 && isa_ok(Isa::Avx2))
        return avx2_nvfp4_gu_rows(gate, g_row, up, u_row, n, act, nt, g_out, u_out, r0, r1);
#endif
    (void) a, (void) gate, (void) g_row, (void) up, (void) u_row, (void) n, (void) act, (void) nt, (void) g_out,
        (void) u_out, (void) r0, (void) r1;
    return false;
}

bool nvfp4_down_rows(Arith a, const uint8_t* down, size_t d_row, int n,
                     const void* const* act, int nt, float* out, int r0, int r1) noexcept {
#ifdef STRATA_QUANT_X86_TIERS
    if (a == Arith::Avx2 && isa_ok(Isa::Avx2))
        return avx2_nvfp4_down_rows(down, d_row, n, act, nt, out, r0, r1);
#endif
    (void) a, (void) down, (void) d_row, (void) n, (void) act, (void) nt, (void) out, (void) r0, (void) r1;
    return false;
}

const ActKernel* act_kernel(Type act, Arith a, Isa max_isa) noexcept {
    const ActKernel* v[kMaxK];
    const int n = collect_acts(act, a, v, kMaxK);
    for (int i = 0; i < n; ++i)
        if ((int) v[i]->isa <= (int) max_isa && isa_ok(v[i]->isa)) return v[i];
    return nullptr;
}

const ActKernel* act_kernel(Type act, Arith a) noexcept { return act_kernel(act, a, best_isa()); }

}  // namespace strata::quant
