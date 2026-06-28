export default `{{dependencyHeader}}{{dependencyCode}}
{{siblingHeader}}{{siblingDeclarations}}
Generate {{targetLanguage}} code for a classifier function.

This function takes an instance of {{baseTypeName}} and returns a boolean.
{{typeInstruction}}
It should test whether the input satisfies the constraints below and return true only if it is a valid member of the constrained type:

{{declaration}}

In the constraint list above:
- @ref references a property of the input object (e.g., @x.y.z drills into nested members). Resolve each segment as a field lookup on the corresponding type. If the name matches a declared constraint instead, it means the input should satisfy that constraint — check it by invoking the corresponding classifier.
- Lines without @ are plain-text instructions — implement them directly.
`
