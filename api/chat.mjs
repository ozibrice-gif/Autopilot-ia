
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée"
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Clé API non configurée sur Vercel"
      });
    }

    const message = req.body?.message;

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 8000
    ) {
      return res.status(400).json({
        error: "Message invalide ou trop long"
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-6.2-astra",
          instructions:
            "Tu es AUTOPILOT AI, un assistant intelligent, professionnel, prudent et rigoureux. Tu réponds en français par défaut. Tu ne fabriques jamais de faits. Si tu ignores une information, tu le dis clairement.",
          input: message
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return res.status(502).json({
        error: "Le moteur IA n'a pas pu répondre. Vérifie la configuration API."
      });
    }

    const answer = data.output
      ?.flatMap(item => item.content || [])
      .find(item => item.type === "output_text")
      ?.text;

    if (!answer) {
      return res.status(502).json({
        error: "Aucune réponse textuelle reçue."
      });
    }

    return res.status(200).json({
      success: true,
      answer
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erreur interne du serveur."
    });
  }
}
