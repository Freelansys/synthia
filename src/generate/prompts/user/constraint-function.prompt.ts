export default `{{dependencyHeader}}{{dependencyCode}}
{{siblingHeader}}{{siblingDeclarations}}
Generate {{targetLanguage}} code that implements function "{{objectName}}" with the specified constraints and logic.
{{typeInstruction}}

{{declaration}}

In the constraint list above:
- @Name (capitalized) references another declared constraint — ensure the function satisfies that referenced constraint.
- @name (lowercase) references a field on the input object — use the field's value in the logic.
- Lines without @ are plain-text instructions — implement them directly.
`
