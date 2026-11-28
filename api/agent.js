export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({
      error: 'Variable GEMINI_API_KEY absente ou vide sur Vercel. Ajoutez-la puis faites un Redeploy.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      systemInstruction = '',
      input = '',
      serviceTier = 'pro',
      multiAgent = false,
      companionPrompts = []
    } = body;

    if (!String(input || '').trim()) {
      return res.status(400).json({ error: 'Le contenu de la mission est vide.' });
    }

    const callGemini = async (sysPrompt, promptText, temp) => {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            systemInstruction: sysPrompt ? { parts: [{ text: String(sysPrompt) }] } : undefined,
            contents: [{ role: 'user', parts: [{ text: String(promptText) }] }],
            generationConfig: { temperature: temp }
          })
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const googleMsg = data?.error?.message || `Erreur HTTP ${response.status}`;
        throw new Error(`Appel IA refusé (${googleMsg})`);
      }

      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map(p => (typeof p?.text === 'string' ? p.text : ''))
        .join('\n')
        .trim();

      if (!text) {
        const finishReason = data?.candidates?.[0]?.finishReason || 'INCONNU';
        throw new Error(`Réponse IA vide (raison : ${finishReason}).`);
      }

      return text;
    };

    const temp = serviceTier === 'pro' ? 0.35 : 0.25;
    const primaryOutput = await callGemini(systemInstruction, String(input).trim(), temp);

    if (!multiAgent || !Array.isArray(companionPrompts) || companionPrompts.length === 0) {
      return res.status(200).json({ output: primaryOutput, steps: [] });
    }

    const steps = [];
    for (const peer of companionPrompts) {
      const peerTitle = peer?.title || 'Agent complémentaire';
      const peerSys = peer?.systemPrompt || systemInstruction;
      const peerText = await callGemini(
        peerSys,
        `Mission initiale :\n${String(input).trim()}\n\nLivrable à contrôler / structurer :\n${primaryOutput}`,
        0.3
      );
      steps.push({ title: peerTitle, output: peerText });
    }

    const combined = [
      `=== Agent principal ===\n${primaryOutput}`,
      ...steps.map(s => `=== ${s.title} ===\n${s.output}`)
    ].join('\n\n');

    return res.status(200).json({ output: combined, steps });
  } catch (err) {
    return res.status(502).json({
      error: err?.message || 'Erreur inconnue dans /api/agent.'
    });
  }
}
