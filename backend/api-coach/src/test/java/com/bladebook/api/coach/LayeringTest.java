package com.bladebook.api.coach;

import com.bladebook.core.data.AccessContext;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.type;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** Controllers go through core services; only core.data reaches DynamoDB. */
@AnalyzeClasses(packages = "com.bladebook.api.coach", importOptions = ImportOption.DoNotIncludeTests.class)
class LayeringTest {

    /** Controllers may name the caller ({@code AccessContext}) but never touch a repository or client. */
    @ArchTest
    static final ArchRule controllersDoNotUseRepositories = noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat(resideInAPackage("com.bladebook.core.data..")
                    .and(not(type(AccessContext.class))))
            .allowEmptyShould(true);

    /** Who the caller is comes only from the token, through the security package. */
    @ArchTest
    static final ArchRule onlySecurityMakesAnAccessContext = noClasses()
            .that().resideOutsideOfPackage("..security..")
            .should().callConstructor(AccessContext.class, String.class)
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule onlyCoreDataUsesDynamoDb = noClasses()
            .should().dependOnClassesThat().resideInAPackage("software.amazon.awssdk.services.dynamodb..")
            .allowEmptyShould(true);
}
