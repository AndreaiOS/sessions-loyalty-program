export default async function handler(req, res) {
  res.status(200).json({
    service: "sessions-rewards-mvp",
    status: "ok",
    endpoints: {
      wallet: "/wallet/{token}",
      loyalty: "/loyalty/{operation}",
      membership: "/membership",
      admin: "/admin?venue_id=...",
    },
  });
}
