import Pusher from "pusher"

/**
 * Pusher Configuration
 * 
 * Provides real-time WebSocket communication for broadcasting live voting statistics
 * and election updates to connected clients without polling.
 * 
 * Use Cases:
 * - Broadcasting real-time vote counts to dashboard clients
 * - Pushing election result updates to all connected users
 * - Notifying clients of candidate status changes
 * - Live updates during active voting periods
 * 
 * Channel Naming Convention:
 * - Use descriptive, namespaced channel names (e.g., 'election-12345-votes')
 * - Private channels should be prefixed with 'private-' for authentication
 * - Presence channels use 'presence-' prefix for user tracking
 * 
 * Event Naming Convention:
 * - Use kebab-case for event names (e.g., 'vote-counted', 'results-updated')
 * - Keep event names specific to the action being broadcast
 * 
 * Security Considerations:
 * - Server-side only - never expose credentials to client
 * - Use Pusher's built-in authentication for private/presence channels
 * - Validate all data before broadcasting to prevent injection attacks
 * - Rate limit broadcast frequency to prevent abuse
 * - Use encrypted connections (WSS) in production
 * 
 * Environment Variables Required:
 * - PUSHER_APPID: Pusher application ID from dashboard
 * - PUSHER_KEY: Public key for client connections
 * - PUSHER_SECRET: Secret key for server authentication (keep secure)
 * - PUSHER_CLUSTER: Geographic cluster (e.g., 'ap1', 'us2')
 * 
 * @returns Promise<Pusher> Configured Pusher server client instance
 */
export const getPusherClient = async () => {
     // Initialize Pusher server client with environment credentials
     // This client is used server-side to trigger events and broadcast data
     const pusher = new Pusher({
               appId: String(process.env.PUSHER_APPID),
               key: String(process.env.PUSHER_KEY),
               secret: String(process.env.PUSHER_SECRET),
               cluster: String(process.env.PUSHER_CLUSTER)
     })
     return pusher
}