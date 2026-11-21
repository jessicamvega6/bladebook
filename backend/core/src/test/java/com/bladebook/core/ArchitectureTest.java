package com.bladebook.core;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** The rules that keep core/ framework-free and DynamoDB behind core.data (ADR-MASTER section 1). */
@AnalyzeClasses(packages = "com.bladebook.core", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule onlyDataUsesDynamoDb = noClasses()
            .that().resideOutsideOfPackage("com.bladebook.core.data..")
            .should().dependOnClassesThat().resideInAPackage("software.amazon.awssdk.services.dynamodb..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule domainIsPlain = noClasses()
            .that().resideInAPackage("com.bladebook.core.domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.bladebook.core.service..", "com.bladebook.core.data..", "software.amazon.awssdk..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule dataDoesNotCallServices = noClasses()
            .that().resideInAPackage("com.bladebook.core.data..")
            .should().dependOnClassesThat().resideInAPackage("com.bladebook.core.service..")
            .allowEmptyShould(true);

    /**
     * ADR-MASTER section 16: the family path never asks for the item back when a condition fails, so a
     * failed write can't reveal another family's data. The client-tenant policy refuses it too.
     */
    @ArchTest
    static final ArchRule familyPathNeverReturnsValuesOnConditionFailure = noClasses()
            .that().haveSimpleNameStartingWith("Family").or().haveSimpleName("CodeRepository")
            .or().haveSimpleName("BookingRepository").or().haveSimpleName("ClientLinks").or().haveSimpleName("SeatItems")
            .should().dependOnClassesThat().haveSimpleName("ReturnValuesOnConditionCheckFailure")
            .allowEmptyShould(true);

    /** ADR-MASTER section 16, the write link check: a LinkedSkater is made only by ClientLinks, in core.data. */
    @ArchTest
    static final ArchRule onlyCoreDataMakesALinkedSkater = noClasses()
            .that().resideOutsideOfPackage("com.bladebook.core.data..")
            .should().callConstructorWhere(com.tngtech.archunit.core.domain.JavaCall.Predicates.target(
                    com.tngtech.archunit.core.domain.properties.HasOwner.Predicates.With.owner(
                            com.tngtech.archunit.core.domain.JavaClass.Predicates.type(com.bladebook.core.data.LinkedSkater.class))))
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule noSpring = noClasses()
            .should().dependOnClassesThat().resideInAPackage("org.springframework..")
            .allowEmptyShould(true);
}
