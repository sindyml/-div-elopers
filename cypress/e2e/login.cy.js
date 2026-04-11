describe("Login Page", () => {
  it("loads login page correctly", () => {
    cy.visit("http://localhost:5500/login.html");

    cy.get("#email").should("exist");
    cy.get("#password").should("exist");
    cy.get("#loginBtn").should("exist");
  });

  it("shows error when fields are empty", () => {
    cy.visit("http://localhost:5500/login.html");

    cy.get("#loginBtn").click();

    // depends on your UI behavior (alert or message)
    cy.on("window:alert", (text) => {
      expect(text).to.include("error");
    });
  });
});