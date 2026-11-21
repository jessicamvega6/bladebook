package com.bladebook.core.domain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The big price change warning (ADR-MASTER section 9; FeatureDecriptions/Schedule Creater.md, "Big price change
 * warning"; threshold settled 2026-10-13): a block whose price moves by 50% or more of its old price, up or down,
 * must be acknowledged before the coach can accept. A block that was free ($0) has no percentage to measure, so it
 * never warns, as the design draws it.
 */
public record PriceChange(int seq, String label, int fromMinor, int toMinor) {

    static final int WARN_PERCENT = 50;

    public static boolean isBig(int fromMinor, int toMinor) {
        if (fromMinor <= 0) {
            return false;
        }
        return Math.abs((long) toMinor - fromMinor) * 100 >= (long) WARN_PERCENT * fromMinor;
    }

    /** The change as a whole percentage of the old price: 90 for $60 to $6. */
    public int percent() {
        return (int) Math.round(Math.abs((double) toMinor - fromMinor) * 100 / fromMinor);
    }

    public boolean cut() {
        return toMinor < fromMinor;
    }

    /** Each block in both lists, matched by its number, whose price changes by enough to warn. */
    public static List<PriceChange> big(List<BlockTemplate> saved, List<BlockTemplate> proposed) {
        Map<Integer, BlockTemplate> was = new HashMap<>();
        saved.forEach(t -> was.put(t.seq(), t));
        List<PriceChange> out = new ArrayList<>();
        for (BlockTemplate t : proposed) {
            BlockTemplate old = was.get(t.seq());
            if (old != null && old.priceMinor() != null && t.priceMinor() != null && isBig(old.priceMinor(), t.priceMinor())) {
                out.add(new PriceChange(t.seq(), t.label(), old.priceMinor(), t.priceMinor()));
            }
        }
        return out;
    }
}
