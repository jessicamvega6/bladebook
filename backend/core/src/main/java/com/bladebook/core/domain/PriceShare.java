package com.bladebook.core.domain;

import java.util.List;

/**
 * A skater's share of a lesson's price (ADR-031 decision 7). The total is on the lesson time and only there;
 * each share is worked out wherever it's shown, never copied onto a seat.
 */
public final class PriceShare {

    private PriceShare() {
    }

    /**
     * {@code priceMinor ÷ shareCount}, with the odd cents one each to the earliest skaters in {@code joinOrder}
     * ($45.01 for two is $22.51 and $22.50). A {@code shareCount} below 2, including an open time nobody has
     * booked, is the whole price.
     */
    public static int of(int priceMinor, int shareCount, List<String> joinOrder, String studentId) {
        if (priceMinor < 0) {
            throw new IllegalArgumentException("price below zero");
        }
        if (shareCount < 2) {
            return priceMinor;
        }
        int base = priceMinor / shareCount;
        int odd = priceMinor % shareCount;
        int place = joinOrder.indexOf(studentId);
        return base + (place >= 0 && place < odd ? 1 : 0);
    }
}
