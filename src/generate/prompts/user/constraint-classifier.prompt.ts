export default `{{dependencyHeader}}{{dependencyCode}}
{{siblingHeader}}{{siblingDeclarations}}
Generate {{targetLanguage}} code for a classifier function.

This function takes an instance of {{baseTypeName}} and returns a boolean.
{{typeInstruction}}
It should test whether the input satisfies the constraints below and return true only if it is a valid member of the constrained type:

{{declaration}}

In the constraint list above:
- @Name (capitalized) references another declared constraint — check that the input satisfies that referenced constraint.
- @name (lowercase) references a field on the input object — use the field's value in the check.
- Lines without @ are plain-text instructions — implement them directly.
`
