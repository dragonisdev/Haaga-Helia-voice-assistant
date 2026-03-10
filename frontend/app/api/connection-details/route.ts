import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

type RequestBody = {
  room_config?: {
    agents?: Array<{
      agent_name?: string;
      metadata?: string;
    }>;
  };
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 5; // Max sessions per IP per minute
const RATE_LIMIT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minute timeout

// In-memory rate limit store (use Redis in production for multi-instance deployments)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Clean up old entries every 10 minutes - store interval ID to prevent memory leaks
let cleanupIntervalId: NodeJS.Timeout | null = null;

// Initialize cleanup interval only once
if (!cleanupIntervalId) {
  cleanupIntervalId = setInterval(
    () => {
      const now = Date.now();
      for (const [ip, data] of rateLimitStore.entries()) {
        if (now > data.resetTime) {
          rateLimitStore.delete(ip);
        }
      }
    },
    10 * 60 * 1000
  );
  
  // Ensure cleanup on module unload (for hot reload in dev)
  if (typeof process !== 'undefined') {
    process.on('beforeExit', () => {
      if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
      }
    });
  }
}

// Helper function to get client IP
async function getClientIP(req: Request): Promise<string> {
  const headersList = await headers();
  // Try various headers that might contain the real IP
  const forwarded = headersList.get('x-forwarded-for');
  const realIP = headersList.get('x-real-ip');
  const cfConnectingIP = headersList.get('cf-connecting-ip'); // Cloudflare

  if (forwarded) {
    // x-forwarded-for can be a comma-separated list, get the first one
    return forwarded.split(',')[0].trim();
  }
  if (realIP) return realIP;
  if (cfConnectingIP) return cfConnectingIP;

  // Fallback (won't work in production behind proxy)
  return 'unknown';
}

// Rate limiting check
function checkRateLimit(ip: string): { allowed: boolean; resetTime?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    // New window
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    // Set timeout for 3 minutes
    record.resetTime = now + RATE_LIMIT_TIMEOUT_MS;
    return { allowed: false, resetTime: record.resetTime };
  }

  // Increment counter
  record.count++;
  return { allowed: true };
}

// Input validation
function validateRequestBody(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request format' };
  }

  const typedBody = body as RequestBody;

  // Validate agent_name if provided
  if (typedBody.room_config?.agents?.[0]?.agent_name) {
    const agentName = typedBody.room_config.agents[0].agent_name;
    if (typeof agentName !== 'string' || agentName.length > 100) {
      return { valid: false, error: 'Invalid agent name' };
    }
  }

  // Validate metadata if provided
  if (typedBody.room_config?.agents?.[0]?.metadata) {
    const metadata = typedBody.room_config.agents[0].metadata;
    if (typeof metadata !== 'string' || metadata.length > 1000) {
      return { valid: false, error: 'Invalid metadata' };
    }
  }

  return { valid: true };
}

// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    // Check environment variables
    if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
      console.error('Missing required environment variables');
      return NextResponse.json(
        { error: 'Service unavailable', message: 'Server is not configured correctly.' },
        { status: 503 }
      );
    }

    // Get client IP for rate limiting
    const clientIP = await getClientIP(req);

    // Check rate limit
    const rateLimitResult = checkRateLimit(clientIP);
    if (!rateLimitResult.allowed) {
      const resetDate = new Date(rateLimitResult.resetTime!);
      const resetHours = Math.ceil((rateLimitResult.resetTime! - Date.now()) / (60 * 60 * 1000));

      console.warn(`Rate limit exceeded for IP: ${clientIP}`);

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You have exceeded the maximum number of sessions. Please try again in ${resetHours} hour${resetHours > 1 ? 's' : ''}.`,
          retryAfter: resetDate.toISOString(),
        },
        { status: 429 }
      );
    }

    // Parse and validate request body
    let body: RequestBody;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Request body must be valid JSON' },
        { status: 400 }
      );
    }

    const validation = validateRequestBody(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid request', message: validation.error },
        { status: 400 }
      );
    }

    const agentName: string | undefined = body?.room_config?.agents?.[0]?.agent_name;
    const agentMetadata: string | undefined = body?.room_config?.agents?.[0]?.metadata;

    // Generate cryptographically secure random IDs
    const participantName = 'anonymous_user';
    const participantIdentity = `user_${crypto.randomUUID()}`;
    const roomName = `room_${crypto.randomUUID()}`;

    // Include IP in metadata for agent to store in transcript
    const enhancedMetadata = JSON.stringify({
      ...(agentMetadata ? JSON.parse(agentMetadata) : {}),
      client_ip: clientIP,
      session_created: new Date().toISOString(),
    });

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      agentName,
      enhancedMetadata
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken: participantToken,
      participantName,
    };

    const responseHeaders = new Headers({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
    });

    return NextResponse.json(data, { headers: responseHeaders });
  } catch (error) {
    // Log error server-side but don't expose details to client
    console.error('Error creating connection:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Unable to create connection. Please try again later.',
      },
      { status: 500 }
    );
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName?: string,
  agentMetadata?: string
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '10m', // Reduced from 15m to 10m for better security
  });

  // Grant only necessary permissions for voice interaction
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true, // Allow audio/video publishing
    canPublishData: false, // Prevent data channel abuse (no text chat)
    canSubscribe: true, // Allow receiving agent audio
  };
  at.addGrant(grant);

  if (agentName) {
    at.roomConfig = new RoomConfiguration({
      agents: [{ agentName, metadata: agentMetadata }],
    });
  }

  return at.toJwt();
}
