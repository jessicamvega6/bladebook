package com.bladebook.api.client;

import com.bladebook.core.data.ClientContext;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.type;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** Controllers go through core services; only core.data reaches DynamoDB. */
@AnalyzeClasses(packages = "com.bladebook.api.client", importOptions = ImportOption.DoNotIncludeTests.class)
class LayeringTest {

    /** Controllers may name the caller ({@code ClientContext}) but never touch a repository or client. */
    @ArchTest
    static final ArchRule controllersDoNotUseRepositories = noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat(resideInAPackage("com.bladebook.core.data..")
                    .and(not(type(ClientContext.class))))
            .allowEmptyShould(true);

    /** Who the caller is comes only from the token, through the security package (ADR-MASTER section 16). */
    @ArchTest
    static final ArchRule onlySecurityMakesAClientContext = noClasses()
            .that().resideOutsideOfPackage("..security..")
            .should().callConstructor(ClientContext.class, String.class)
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule onlyCoreDataUsesDynamoDb = noClasses()
            .should().dependOnClassesThat().resideInAPackage("software.amazon.awssdk.services.dynamodb..")
            .allowEmptyShould(true);
}
