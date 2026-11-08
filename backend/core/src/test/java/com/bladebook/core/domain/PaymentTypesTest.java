package com.bladebook.core.domain;

import com.bladebook.core.domain.PaymentTypes.Type;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.EnumSet;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** ADR-016 d7 (amended 2026-10-12): one switch per payment type. */
class PaymentTypesTest {

    @Test
    void everyTypeIsOffByDefault() {
        PaymentTypes none = PaymentTypes.none();
        for (Type t : Type.values()) {
            assertThat(none.isOn(t)).isFalse();
            assertThat(none.handle(t)).isEmpty();
        }
    }

    @Test
    void cashSwitchesOnWithNoHandle() {
        assertThat(PaymentTypes.none().switchOn(Type.CASH).isOn(Type.CASH)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = Type.class, names = {"CASHAPP", "VENMO", "PAYPAL"})
    void aTypeWithAHandleCantSwitchOnWithoutOne(Type type) {
        assertThatThrownBy(() -> PaymentTypes.none().switchOn(type))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("handle")
                .extracting("field").isEqualTo(type.handleField());
    }

    @ParameterizedTest
    @EnumSource(value = Type.class, names = {"CASHAPP", "VENMO", "PAYPAL"})
    void aTypeSwitchesOnOnceItHasAHandle(Type type) {
        PaymentTypes p = PaymentTypes.none().withHandle(type, "dana-skates").switchOn(type);
        assertThat(p.isOn(type)).isTrue();
        assertThat(p.handle(type)).contains(type.prefix() + "dana-skates");
    }

    @Test
    void switchingOffKeepsTheHandle() {
        PaymentTypes p = PaymentTypes.none().withHandle(Type.VENMO, "@dana-skates").switchOn(Type.VENMO)
                .switchOff(Type.VENMO);
        assertThat(p.isOn(Type.VENMO)).isFalse();
        assertThat(p.handle(Type.VENMO)).contains("@dana-skates");
    }

    @Test
    void aKeptHandleLetsTheTypeSwitchBackOn() {
        PaymentTypes p = PaymentTypes.none().withHandle(Type.CASHAPP, "$danaskates").switchOn(Type.CASHAPP)
                .switchOff(Type.CASHAPP).switchOn(Type.CASHAPP);
        assertThat(p.isOn(Type.CASHAPP)).isTrue();
    }

    @Test
    void theHandleOfASwitchedOnTypeCantBeCleared() {
        PaymentTypes p = PaymentTypes.none().withHandle(Type.PAYPAL, "paypal.me/dana").switchOn(Type.PAYPAL);
        assertThatThrownBy(() -> p.withHandle(Type.PAYPAL, "  ")).isInstanceOf(DomainException.class);
    }

    @Test
    void theHandleOfASwitchedOffTypeCanBeCleared() {
        PaymentTypes p = PaymentTypes.none().withHandle(Type.PAYPAL, "paypal.me/dana").withHandle(Type.PAYPAL, "");
        assertThat(p.handle(Type.PAYPAL)).isEmpty();
    }

    @Test
    void handlesAreTrimmed() {
        assertThat(PaymentTypes.none().withHandle(Type.VENMO, "  @dana  ").handle(Type.VENMO)).contains("@dana");
        assertThat(PaymentTypes.none().withHandle(Type.VENMO, "  dana  ").handle(Type.VENMO)).contains("@dana");
    }

    // ---- prefixes (owner, 2026-11-08): $ for Cash App, @ for Venmo, paypal.me/ for PayPal ----

    @Test
    void eachHandleGetsItsPrefix() {
        PaymentTypes p = PaymentTypes.none().withHandle(Type.CASHAPP, "danaskates")
                .withHandle(Type.VENMO, "dana-skates").withHandle(Type.PAYPAL, "dana");
        assertThat(p.handle(Type.CASHAPP)).contains("$danaskates");
        assertThat(p.handle(Type.VENMO)).contains("@dana-skates");
        assertThat(p.handle(Type.PAYPAL)).contains("paypal.me/dana");
    }

    @Test
    void aPrefixTypedByTheCoachIsNotDoubled() {
        PaymentTypes p = PaymentTypes.none().withHandle(Type.CASHAPP, "$danaskates")
                .withHandle(Type.VENMO, "@@dana").withHandle(Type.PAYPAL, "https://www.paypal.me/dana");
        assertThat(p.handle(Type.CASHAPP)).contains("$danaskates");
        assertThat(p.handle(Type.VENMO)).contains("@dana");
        assertThat(p.handle(Type.PAYPAL)).contains("paypal.me/dana");
    }

    @Test
    void thePayPalPrefixIgnoresCase() {
        assertThat(PaymentTypes.none().withHandle(Type.PAYPAL, "PayPal.Me/Dana").handle(Type.PAYPAL))
                .contains("paypal.me/Dana");
    }

    @Test
    void aPrefixAloneCountsAsNoHandle() {
        assertThat(PaymentTypes.none().withHandle(Type.CASHAPP, " $ ").handle(Type.CASHAPP)).isEmpty();
        assertThat(PaymentTypes.none().withHandle(Type.PAYPAL, "paypal.me/").handle(Type.PAYPAL)).isEmpty();
        assertThatThrownBy(() -> PaymentTypes.of(EnumSet.of(Type.VENMO), Map.of(Type.VENMO, "@")))
                .isInstanceOf(DomainException.class)
                .extracting("field").isEqualTo("venmoHandle");
    }

    @Test
    void thePrefixIsInsideTheSixtyCharacterLimit() {
        String fiftyNine = "a".repeat(59);
        assertThat(PaymentTypes.none().withHandle(Type.VENMO, fiftyNine).handle(Type.VENMO)).contains("@" + fiftyNine);
        assertThatThrownBy(() -> PaymentTypes.none().withHandle(Type.VENMO, fiftyNine + "a"))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void cashHasNoHandle() {
        assertThatThrownBy(() -> PaymentTypes.none().withHandle(Type.CASH, "x")).isInstanceOf(DomainException.class);
        assertThat(PaymentTypes.none().withHandle(Type.CASH, null).handle(Type.CASH)).isEmpty();
    }

    @Test
    void aHandleOfSixtyCharactersIsAllowedButNotSixtyOne() {
        String sixty = "@" + "a".repeat(59);
        assertThat(PaymentTypes.none().withHandle(Type.VENMO, sixty).handle(Type.VENMO)).contains(sixty);
        assertThatThrownBy(() -> PaymentTypes.none().withHandle(Type.VENMO, sixty + "a"))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void aHandleCantHoldControlCharacters() {
        assertThatThrownBy(() -> PaymentTypes.none().withHandle(Type.VENMO, "@dana\nskates"))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void ofBuildsTheWholeStateAndChecksEachSwitch() {
        PaymentTypes p = PaymentTypes.of(EnumSet.of(Type.CASH, Type.VENMO),
                Map.of(Type.VENMO, "@dana", Type.CASHAPP, "$dana"));
        assertThat(p.isOn(Type.CASH)).isTrue();
        assertThat(p.isOn(Type.VENMO)).isTrue();
        assertThat(p.isOn(Type.CASHAPP)).isFalse();
        assertThat(p.handle(Type.CASHAPP)).contains("$dana");

        assertThatThrownBy(() -> PaymentTypes.of(EnumSet.of(Type.PAYPAL), Map.of()))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void isImmutable() {
        PaymentTypes none = PaymentTypes.none();
        none.switchOn(Type.CASH);
        assertThat(none.isOn(Type.CASH)).isFalse();
    }

    @Test
    void equalStatesAreEqual() {
        assertThat(PaymentTypes.none().switchOn(Type.CASH)).isEqualTo(PaymentTypes.none().switchOn(Type.CASH))
                .hasSameHashCodeAs(PaymentTypes.none().switchOn(Type.CASH))
                .isNotEqualTo(PaymentTypes.none());
    }
}
