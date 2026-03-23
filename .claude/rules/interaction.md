# Interaction Rules

- Interactions are blocking approval flows owned by the background
- UI approval does not mean the work is finished yet
- In V2 flows, user approval resolves the wait step first, then the actual protected action runs

## Flow

1. Background creates an interaction
2. UI receives pending interaction data
3. User approves or rejects
4. Background resumes and completes the protected action
5. Queue processing decides whether the UI stays open or closes

## Working Rules

- Treat approval flows as two-phase flows when V2 interaction APIs are involved
- Do not assume signing or submission already happened at the moment the user clicks approve
- Be careful when changing queue behavior, popup closing behavior, or proceed-next behavior
- Pre-approval gates such as unlock, registration, or permission checks may create their own interactions first
