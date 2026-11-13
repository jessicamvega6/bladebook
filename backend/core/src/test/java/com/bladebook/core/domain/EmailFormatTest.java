package com.bladebook.core.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** What the sending code passes SES, already formatted (design/harbor/email/README.md, "What the sending Lambda must pass"). */
class EmailFormatTest {

    @Test
    void datesAreWeekdayMonthDay() {
        assertThat(EmailFormat.date(LocalDate.of(2026, 10, 21))).isEqualTo("Wed, Oct 21");
        assertThat(EmailFormat.date(LocalDate.of(2026, 11, 1))).isEqualTo("Sun, Nov 1");
    }

    @Test
    void timesAreTwelveHour() {
        assertThat(EmailFormat.time(LocalTime.of(6, 30))).isEqualTo("6:30 AM");
        assertThat(EmailFormat.time(LocalTime.of(0, 0))).isEqualTo("12:00 AM");
        assertThat(EmailFormat.time(LocalTime.of(12, 15))).isEqualTo("12:15 PM");
        assertThat(EmailFormat.time(LocalTime.of(23, 45))).isEqualTo("11:45 PM");
    }

    @Test
    void lengthsAreMinutes() {
        assertThat(EmailFormat.length(30)).isEqualTo("30 min");
        assertThat(EmailFormat.length(90)).isEqualTo("90 min");
    }

    @Test
    void wholeDollarsHaveNoCents() {
        assertThat(EmailFormat.money(5000, "USD")).isEqualTo("$50");
        assertThat(EmailFormat.money(0, "USD")).isEqualTo("$0");
        assertThat(EmailFormat.money(2501, "USD")).isEqualTo("$25.01");
        assertThat(EmailFormat.money(123456, "USD")).isEqualTo("$1,234.56");
    }

    @Test
    void otherCurrenciesUseTheirSymbol() {
        assertThat(EmailFormat.money(5000, "CAD")).isEqualTo("CA$50");
    }

    @Test
    void anUnknownCurrencyIsRefused() {
        assertThatThrownBy(() -> EmailFormat.money(5000, "XYZ1")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aMomentIsShownInTheCoachsZone() {
        // 12:00 UTC is 6:00 AM in Chicago in November.
        assertThat(EmailFormat.dateTime(Instant.parse("2026-11-16T12:00:00Z"), "America/Chicago")).isEqualTo("Mon, Nov 16 at 6:00 AM");
    }

    @Test
    void namesAreJoinedInPlainEnglish() {
        assertThat(EmailFormat.and(List.of())).isEqualTo("");
        assertThat(EmailFormat.and(List.of("Mia"))).isEqualTo("Mia");
        assertThat(EmailFormat.and(List.of("Mia", "Noah"))).isEqualTo("Mia and Noah");
        assertThat(EmailFormat.and(List.of("Mia", "Noah", "Ava"))).isEqualTo("Mia, Noah and Ava");
    }

    @Test
    void firstNameIsTheFirstWord() {
        assertThat(EmailFormat.first("Mia Chen")).isEqualTo("Mia");
        assertThat(EmailFormat.first("Mia C.")).isEqualTo("Mia");
        assertThat(EmailFormat.first("Mia")).isEqualTo("Mia");
    }

    @Test
    void paymentInstructionsBecomeLinesWithoutBlanks() {
        assertThat(EmailFormat.lines("Please pay within a week.\r\n\r\nCash is fine at the rink.  \n"))
                .containsExactly("Please pay within a week.", "Cash is fine at the rink.");
        assertThat(EmailFormat.lines(null)).isEmpty();
        assertThat(EmailFormat.lines("   ")).isEmpty();
    }
}
