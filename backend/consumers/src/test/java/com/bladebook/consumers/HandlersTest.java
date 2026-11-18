package com.bladebook.consumers;

import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.bladebook.core.events.EventConsumers;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/** One handler per named event (ADR-MASTER section 2), each handing on its own event and no other. */
class HandlersTest {

    @Test
    void eachEventHasExactlyOneHandler() {
        List<JavaClass> handlers = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.bladebook.consumers.handler").stream()
                .filter(c -> c.isAssignableTo(RequestStreamHandler.class)).toList();
        Map<String, List<String>> eventsByHandler = handlers.stream().collect(Collectors.toMap(JavaClass::getSimpleName,
                c -> c.getFieldAccessesFromSelf().stream().map(JavaFieldAccess::getTarget)
                        .filter(t -> t.getOwner().isEquivalentTo(EventConsumers.Event.class)).map(t -> t.getName()).toList()));

        assertThat(eventsByHandler.values()).allSatisfy(events -> assertThat(events).hasSize(1));
        assertThat(eventsByHandler.values().stream().map(l -> l.get(0)).sorted().toList())
                .isEqualTo(Arrays.stream(EventConsumers.Event.values()).map(Enum::name).sorted().toList());
    }
}
