export default `{{dependencyHeader}}{{dependencyCode}}
{{siblingHeader}}{{siblingDeclarations}}
Generate {{targetLanguage}} code that implements function "{{objectName}}" with the specified constraints and logic.
{{typeInstruction}}

{{declaration}}

In the constraint list above:
- @ref references a property of the input object (e.g., @x.y.z drills into nested members). Resolve each segment as a field lookup on the corresponding type. If the name matches a declared constraint instead, it means the input should satisfy that constraint — check it by invoking the corresponding function.
- Lines without @ are plain-text instructions — implement them directly.
`
