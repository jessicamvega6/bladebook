package com.bladebook.consumers;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** Handlers go through core services; only core.data reaches DynamoDB; no framework. */
@AnalyzeClasses(packages = "com.bladebook.consumers", importOptions = ImportOption.DoNotIncludeTests.class)
class LayeringTest {

    @ArchTest
    static final ArchRule handlersDoNotUseRepositories = noClasses()
            .should().dependOnClassesThat().resideInAPackage("com.bladebook.core.data..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule onlyCoreDataUsesDynamoDb = noClasses()
            .should().dependOnClassesThat().resideInAPackage("software.amazon.awssdk.services.dynamodb..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule noSpring = noClasses()
            .should().dependOnClassesThat().resideInAPackage("org.springframework..")
            .allowEmptyShould(true);
}
