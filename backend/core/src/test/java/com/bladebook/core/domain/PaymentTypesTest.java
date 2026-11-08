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
        PaymentTypes p = PaymentTypes.none().withHandle(type, "@dana-skates").switchOn(type);
        assertThat(p.isOn(type)).isTrue();
        assertThat(p.handle(type)).contains("@dana-skates");
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
    }

    @Test
    void cashHasNoHandle() {
        assertThatThrownBy(() -> PaymentTypes.none().withHandle(Type.CASH, "x")).isInstanceOf(DomainException.class);
        assertThat(PaymentTypes.none().withHandle(Type.CASH, null).handle(Type.CASH)).isEmpty();
    }

    @Test
    void aHandleOfSixtyCharactersIsAllowedButNotSixtyOne() {
        String sixty = "a".repeat(60);
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
