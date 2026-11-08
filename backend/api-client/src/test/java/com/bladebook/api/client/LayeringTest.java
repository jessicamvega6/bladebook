package com.bladebook.api.client;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** Controllers go through core services; only core.data reaches DynamoDB. */
@AnalyzeClasses(packages = "com.bladebook.api.client", importOptions = ImportOption.DoNotIncludeTests.class)
class LayeringTest {

    @ArchTest
    static final ArchRule controllersDoNotUseRepositories = noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat().resideInAPackage("com.bladebook.core.data..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule onlyCoreDataUsesDynamoDb = noClasses()
            .should().dependOnClassesThat().resideInAPackage("software.amazon.awssdk.services.dynamodb..")
            .allowEmptyShould(true);
}
