## FEATURE:

I would like to create a single docker image, that is able to be used exactly like the workflow "uses: anthropics/claude-code-action@beta" That all of the Variables are passed in as env variables, This would allow me to modify more details of it in the future ( Like how to make the branch names and stuff

## Examples

build-docker-image.yaml : In order for our github to automaticly build this docker image, you will need to use this
claude-code-action : claude.yaml uses this, and is the start of the workflow
claude-code-base-action : This is used by claude-code-action and I think has all of the actual scripts used
claude.yaml : An example of how we currently include claude in the workflow

## DOCUMENTATION:
https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions

## OTHER CONSIDERATIONS:

