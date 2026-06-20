export default `{{dependencyHeader}}{{dependencyCode}}
{{siblingHeader}}{{siblingDeclarations}}
Generate {{targetLanguage}} code for a classifier function.

This function takes an instance of {{baseTypeName}} and returns a boolean.
It should test whether the input satisfies the constraints below and return true only if it is a valid member of the constrained type:

{{declaration}}
`
