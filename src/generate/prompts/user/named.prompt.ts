export default `{{dependencyHeader}}{{dependencyCode}}
{{siblingHeader}}{{siblingDeclarations}}
Generate {{targetLanguage}} code for a type alias named {{objectName}}.

The alias resolves to: {{resolvedDeclaration}}

This is a named reference to an existing type. Generate the appropriate type alias, wrapper, or newtype following {{archStyle}} architecture conventions. Use descriptive naming based on the architecture style.
`
