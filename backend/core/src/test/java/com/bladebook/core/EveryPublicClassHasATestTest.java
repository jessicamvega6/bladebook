package com.bladebook.core;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** ADR-013: every public class in core/ has a test class named after it, in the same package. */
class EveryPublicClassHasATestTest {

    @Test
    void everyPublicClassHasATest() {
        List<String> untested = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.bladebook.core")
                .stream()
                .filter(JavaClass::isTopLevelClass)
                .filter(c -> c.getModifiers().contains(JavaModifier.PUBLIC))
                .filter(c -> !c.getSimpleName().equals("package-info"))
                .map(JavaClass::getName)
                .filter(name -> !exists(name + "Test"))
                .sorted()
                .toList();

        assertThat(untested).as("public classes in core/ with no test class").isEmpty();
    }

    private static boolean exists(String className) {
        try {
            Class.forName(className, false, EveryPublicClassHasATestTest.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }
}
