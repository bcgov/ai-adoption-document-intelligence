# Elicitation Standards & Tips

Use these categories to generate questions when analyzing requirements.

## 1. The "Who" (Personas)
- Who exactly is the user? (Admin, Guest, Registered User?)
- Are there different permissions or roles involved?
- *Tip*: Never assume "User" is a single entity.

## 2. The "What" (Functional & Edge Cases)
- **Happy Path**: What is the ideal flow?
- **Unhappy Path**: What happens if...
    - The operation fails?
    - The data is missing?
    - The internet connection is lost?
    - The user inputs invalid data?

## 3. The "Where" & "When" (Context)
- Is this mobile, desktop, or both?
- Does this happen in real-time or as a background job?

## 4. The "How" (Data & Integrity)
- Where does the data come from?
- Do we need to validate formats (email, phone, dates)?
- Are there security concerns (PII, specialized access)?

## 5. Non-Functional Requirements
- **Performance**: How fast must it load?
- **Scale**: How many headers/items?
- **Localization**: Do we need multi-language support?