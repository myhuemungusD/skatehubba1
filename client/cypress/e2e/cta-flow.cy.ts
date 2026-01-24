describe("CTA flow", () => {
  it("navigates through landing CTAs and auth entry points", () => {
    cy.visit("/landing");

    cy.get('[data-testid="cta-landing-primary"]').should("be.visible").click();
    cy.location("pathname").should("eq", "/auth");

    cy.contains("Sign Up").click();
    cy.get("#signup-firstName").should("be.visible");

    cy.contains("Sign In").click();
    cy.get("#signin-email").should("be.visible");

    cy.visit("/landing");
    cy.get('[data-testid="cta-landing-secondary"]').should("be.visible").click();
    cy.location("pathname").should("eq", "/specs");

    cy.get('[data-testid="link-back-home"]').should("be.visible").click();
    cy.location("pathname").should("eq", "/");
  });
});
