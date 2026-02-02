# Haaga-Helia Voice Assistant

A real-time AI voice assistant designed to help Haaga-Helia students with questions about campus life, thesis guidance, student life in Finland, and general academic inquiries. Built with LiveKit Cloud for low-latency voice interactions.

## 🎯 Purpose

This voice assistant serves as an intelligent, conversational guide for Haaga-Helia students, providing instant answers about:
- Campus locations and facilities
- Thesis process and guidelines
- Student life in Finland
- Academic procedures and resources
- General university information

## 🏗️ Architecture

The project consists of three main components:

1. **Python Agent** (`livekit_agent_python/`) - The AI voice agent backend powered by LiveKit
2. **Next.js Frontend** (`livekit-frontend/`) - Interactive web interface for voice conversations
3. **Supabase Database** (`supabase/`) - Stores conversation transcripts and analytics

## 🛠️ Technology Stack

- **Backend**: Python 3.x with LiveKit Agents SDK
- **Frontend**: Next.js 14+ with TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Voice Infrastructure**: LiveKit Cloud
- **Deployment**: Railway (backend), Vercel (frontend)

## 📋 Prerequisites

Before running this project, ensure you have:

- Python 3.9 or higher
- Node.js 18+ and pnpm
- LiveKit Cloud account ([livekit.io](https://livekit.io))
- Supabase project ([supabase.com](https://supabase.com))
- API keys for your chosen LLM provider (OpenAI, Anthropic Claude, or Google Gemini)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Haaga-Helia-voice-assistant
```

### 2. Setup Python Agent

```bash
cd livekit_agent_python

# Install dependencies
pip install -e .

# Create .env file with required credentials
cat > .env << EOF
LIVEKIT_URL=<your-livekit-url>
LIVEKIT_API_KEY=<your-api-key>
LIVEKIT_API_SECRET=<your-api-secret>
OPENAI_API_KEY=<your-openai-key>  # Or other LLM provider
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-key>
EOF

# Run the agent locally
python src/agent.py dev
```

### 3. Setup Frontend

```bash
cd livekit-frontend

# Install dependencies
pnpm install

# Create .env.local file
cat > .env.local << EOF
LIVEKIT_API_KEY=<your-api-key>
LIVEKIT_API_SECRET=<your-api-secret>
LIVEKIT_URL=<your-livekit-url>
NEXT_PUBLIC_LIVEKIT_URL=<your-livekit-url>
EOF

# Run the development server
pnpm dev
```

### 4. Setup Supabase (Optional)

If you want conversation logging and analytics:

```bash
cd supabase

# Apply migrations to your Supabase project
# Use the Supabase CLI or dashboard to run migrations in migrations/
```

## 🎮 Usage

1. Start the Python agent (see step 2 above)
2. Start the frontend development server (see step 3 above)
3. Open your browser to `http://localhost:3000`
4. Click "Start Audio" to begin a conversation with the voice assistant
5. Ask questions about Haaga-Helia, campus life, thesis guidance, etc.

## 📁 Project Structure

```
├── livekit_agent_python/     # Python voice agent backend
│   ├── src/
│   │   └── agent.py          # Main agent logic
│   ├── Dockerfile            # Docker configuration
│   └── pyproject.toml        # Python dependencies
├── livekit-frontend/         # Next.js web interface
│   ├── app/                  # Next.js app router
│   ├── components/           # React components
│   └── hooks/                # Custom React hooks
├── supabase/                 # Database migrations
│   └── migrations/           # SQL migration files
└── README.md                 # This file
```

## 🔧 Configuration

### Agent Configuration

The agent can be configured to use different LLM providers:
- **OpenAI GPT-4** (default)
- **Anthropic Claude** (see `CLAUDE.md`)
- **Google Gemini** (see `GEMINI.md`)

Refer to the respective documentation files in `livekit_agent_python/` for setup instructions.

### Environment Variables

**Backend (`livekit_agent_python/.env`)**:
- `LIVEKIT_URL` - Your LiveKit server URL
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret
- `OPENAI_API_KEY` - OpenAI API key (or other LLM provider)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

**Frontend (`livekit-frontend/.env.local`)**:
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret
- `LIVEKIT_URL` - LiveKit server URL
- `NEXT_PUBLIC_LIVEKIT_URL` - Public-facing LiveKit URL

## 🚢 Deployment

- **Backend**: Deploy to Railway using the included `railway.toml` and `Dockerfile`
- **Frontend**: Deploy to Vercel or any Next.js-compatible platform
- **Database**: Managed by Supabase

See [RAILWAY_DEPLOYMENT.md](livekit_agent_python/RAILWAY_DEPLOYMENT.md) for detailed deployment instructions.

## 📊 Features

- ✅ Real-time voice conversations with low latency
- ✅ Natural language understanding for student queries
- ✅ Multi-LLM support (OpenAI, Claude, Gemini)
- ✅ Conversation transcripts and analytics
- ✅ Responsive web interface
- ✅ Audio visualization
- ✅ Session management
- ✅ Anonymous usage tracking

## 📝 Documentation

Additional documentation available in the project:
- [Agent Comparison](livekit_agent_python/AGENT_COMPARISON.md)
- [Production Readiness](PRODUCTION_READINESS.md)
- [Security Fixes](SECURITY_FIXES.md)
- [Supabase Transcript Integration](livekit_agent_python/SUPABASE_TRANSCRIPT_INTEGRATION.md)

## 🔒 Security

See [SECURITY_FIXES.md](SECURITY_FIXES.md) for important security considerations and implemented fixes.

## 🤝 Contributing

Contributions are welcome! Please ensure your code follows the existing style and includes appropriate tests.

## 📄 License

[Add your license information here]

## 🆘 Support

For questions or issues, please contact [your support email/channel].

---

**Built with ❤️ for Haaga-Helia students**
