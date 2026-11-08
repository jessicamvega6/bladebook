package com.bladebook.core.domain;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The payment types a coach takes (ADR-016 d7, amended 2026-10-12). One switch per type, all off by
 * default. A type with a handle needs the handle before it can switch on; switching off keeps the
 * handle. Immutable.
 */
public final class PaymentTypes {

    /** Each type, with the profile attributes that hold it. */
    public enum Type {
        CASH("acceptsCash", null),
        CASHAPP("acceptsCashapp", "cashappHandle"),
        VENMO("acceptsVenmo", "venmoHandle"),
        PAYPAL("acceptsPaypal", "paypalHandle");

        private final String switchField;
        private final String handleField;

        Type(String switchField, String handleField) {
            this.switchField = switchField;
            this.handleField = handleField;
        }

        public boolean hasHandle() {
            return handleField != null;
        }

        public String switchField() {
            return switchField;
        }

        /** The handle attribute, or {@code null} for cash. */
        public String handleField() {
            return handleField;
        }

        String label() {
            switch (this) {
                case CASHAPP: return "Cash App";
                case VENMO: return "Venmo";
                case PAYPAL: return "PayPal";
                default: return "Cash";
            }
        }
    }

    static final int MAX_HANDLE = 60;

    private static final PaymentTypes NONE = new PaymentTypes(EnumSet.noneOf(Type.class), new EnumMap<>(Type.class));

    private final Set<Type> on;
    private final Map<Type, String> handles;

    private PaymentTypes(Set<Type> on, Map<Type, String> handles) {
        this.on = Collections.unmodifiableSet(on.isEmpty() ? EnumSet.noneOf(Type.class) : EnumSet.copyOf(on));
        EnumMap<Type, String> copy = new EnumMap<>(Type.class);
        copy.putAll(handles);
        this.handles = Collections.unmodifiableMap(copy);
    }

    public static PaymentTypes none() {
        return NONE;
    }

    /**
     * The whole state at once, as a form sends it: every handle first, then each switch, so each
     * switched-on type is checked for its handle.
     */
    public static PaymentTypes of(Set<Type> switchedOn, Map<Type, String> handles) {
        PaymentTypes p = none();
        for (Map.Entry<Type, String> e : handles.entrySet()) {
            p = p.withHandle(e.getKey(), e.getValue());
        }
        for (Type t : switchedOn) {
            p = p.switchOn(t);
        }
        return p;
    }

    public boolean isOn(Type type) {
        return on.contains(type);
    }

    public Optional<String> handle(Type type) {
        return Optional.ofNullable(handles.get(type));
    }

    /** Sets or clears a handle. A switched-on type's handle can't be cleared. */
    public PaymentTypes withHandle(Type type, String handle) {
        String h = handle == null ? "" : handle.trim();
        if (!type.hasHandle()) {
            if (!h.isEmpty()) {
                throw DomainException.invalid(type.switchField(), "Cash has no handle.");
            }
            return this;
        }
        EnumMap<Type, String> next = new EnumMap<>(Type.class);
        next.putAll(handles);
        if (h.isEmpty()) {
            if (on.contains(type)) {
                throw DomainException.invalid(type.handleField(),
                        "Switch " + type.label() + " off before removing its handle.");
            }
            next.remove(type);
        } else {
            if (h.length() > MAX_HANDLE) {
                throw DomainException.invalid(type.handleField(),
                        "Keep the " + type.label() + " handle to " + MAX_HANDLE + " characters.");
            }
            if (h.chars().anyMatch(Character::isISOControl)) {
                throw DomainException.invalid(type.handleField(), "The " + type.label() + " handle has a character it can't hold.");
            }
            next.put(type, h);
        }
        return new PaymentTypes(on.isEmpty() ? EnumSet.noneOf(Type.class) : EnumSet.copyOf(on), next);
    }

    public PaymentTypes switchOn(Type type) {
        if (type.hasHandle() && !handles.containsKey(type)) {
            throw DomainException.invalid(type.handleField(),
                    "Add your " + type.label() + " handle before switching it on.");
        }
        EnumSet<Type> next = on.isEmpty() ? EnumSet.noneOf(Type.class) : EnumSet.copyOf(on);
        next.add(type);
        return new PaymentTypes(next, handles);
    }

    /** Switches a type off. Its handle is kept. */
    public PaymentTypes switchOff(Type type) {
        EnumSet<Type> next = on.isEmpty() ? EnumSet.noneOf(Type.class) : EnumSet.copyOf(on);
        next.remove(type);
        return new PaymentTypes(next, handles);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof PaymentTypes && ((PaymentTypes) o).on.equals(on) && ((PaymentTypes) o).handles.equals(handles);
    }

    @Override
    public int hashCode() {
        return 31 * on.hashCode() + handles.hashCode();
    }

    @Override
    public String toString() {
        return "PaymentTypes" + on + handles.keySet();
    }
}
