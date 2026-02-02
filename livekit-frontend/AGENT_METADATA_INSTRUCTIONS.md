# Agent Metadata Implementation Guide

## Overview

This implementation allows users to submit custom instructions through a frontend form that gets passed to your LiveKit agent as metadata. The agent then uses these instructions to customize its behavior for each call.

## How It Works

### 1. **Frontend Form** (`components/app/welcome-view.tsx`)

- Added a textarea input where users can enter custom instructions for the agent
- When the user clicks "Start Call", the instructions are formatted as JSON metadata:
  ```json
  {
    "information": "Your custom instructions here..."
  }
  ```

### 2. **Metadata Flow** (`components/app/view-controller.tsx`)

- The metadata is stored in `sessionStorage` when the user clicks "Start Call"
- This temporary storage allows the metadata to be accessed when the connection is established

### 3. **Token Creation**

Two paths depending on your setup:

#### Option A: Sandbox Mode (`lib/utils.ts` - `getSandboxTokenSource`)

- Retrieves metadata from `sessionStorage`
- Includes it in the room configuration when fetching connection details
- Clears the metadata after use

#### Option B: Standard Mode (`components/app/app.tsx`)

- Custom token source that retrieves metadata from `sessionStorage`
- Includes it in the room configuration when calling `/api/connection-details`
- Clears the metadata after use

### 4. **API Route** (`app/api/connection-details/route.ts`)

- Accepts metadata from the request body
- Passes it to the `RoomAgentDispatch` configuration
- Creates an access token with the metadata included

### 5. **Agent Consumption** (Your Python Agent)

Your agent already has the code to consume this metadata:

```python
class DefaultAgent(Agent):
    def __init__(self, metadata: str) -> None:
        self._templater = VariableTemplater(metadata)
        super().__init__(
            instructions=self._templater.render("""{{metadata.information}}"""),
        )
```

The `ctx.job.metadata` in your `entrypoint` function contains the JSON string with the user's instructions.

## Data Flow Diagram

```
User fills form → Click "Start Call"
    ↓
metadata stored in sessionStorage
    ↓
Token source retrieves metadata
    ↓
POST to /api/connection-details with metadata
    ↓
Backend creates token with RoomAgentDispatch(metadata="...")
    ↓
User joins room with token
    ↓
LiveKit dispatches agent with metadata
    ↓
Agent's __init__ receives metadata via ctx.job.metadata
    ↓
Agent uses {{metadata.information}} as instructions
```

## Example Usage

1. **User Experience:**
   - User opens the app
   - Enters instructions: "You are a friendly customer support agent who specializes in billing questions"
   - Clicks "Start Call"
   - Agent connects with those specific instructions

2. **What the agent receives:**

   ```json
   {
     "information": "You are a friendly customer support agent who specializes in billing questions"
   }
   ```

3. **How the agent uses it:**
   Your `VariableTemplater` parses this JSON and renders `{{metadata.information}}` as the agent's instructions.

## Testing

1. Start your LiveKit agent with the provided code
2. Run the frontend application
3. Enter custom instructions in the textarea
4. Click "Start Call"
5. The agent should greet you with the sarcastic tone (as per your on_enter) and follow the instructions you provided

## Important Notes

- **Default Instructions**: If the user doesn't enter any instructions, a default message is used: "You are a helpful AI assistant."
- **Metadata Cleanup**: The metadata is automatically cleared from `sessionStorage` after the token is created to ensure each call has fresh metadata
- **JSON Format**: The metadata is always sent as a JSON string for structured data handling
- **Agent Name**: Make sure your `appConfig.agentName` matches the `agent_name` in your agent's decorator (`@server.rtc_session(agent_name="Riley-17a9")`)

## Customization

### Extend the Form

You can add more fields to capture additional metadata:

```tsx
const metadata = JSON.stringify({
  information: agentInstructions,
  user_name: userName,
  language: selectedLanguage,
  tone: selectedTone,
});
```

Then access them in your agent:

```python
instructions=self._templater.render("""
  {{metadata.information}}
  Speak in {{metadata.language}}.
  Use a {{metadata.tone}} tone.
""")
```

### Validation

Add validation to ensure users provide valid instructions:

```tsx
const handleStartCall = () => {
  if (!agentInstructions.trim()) {
    alert('Please enter instructions for your agent');
    return;
  }
  // ... rest of the code
};
```

## Troubleshooting

1. **Agent not receiving metadata**:
   - Check browser console for errors
   - Verify the agent name matches in both frontend and backend
   - Ensure your agent is using explicit dispatch (has `agent_name` set)

2. **Metadata not persisting**:
   - This is expected! Metadata is cleared after each connection for security and freshness

3. **Agent using default behavior**:
   - Verify your `VariableTemplater` is parsing the JSON correctly
   - Check that `{{metadata.information}}` is being rendered in the instructions

## Security Considerations

- The metadata is temporary and client-side only until sent to the server
- Consider adding server-side validation for the metadata content
- For production, add rate limiting and content filtering to prevent abuse
- Sanitize user input if displaying it back in the UI
