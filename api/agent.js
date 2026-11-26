export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Variable d’environnement GEMINI_API_KEY manquante sur le serveur Vercel.'
    });
  }

  try {
    const {
      systemInstruction = '',
      input = '',
      serviceTier = 'pro',
      multiAgent = false,
      companionPrompts = []
    } = req.body || {};

    if (!String(input || '').trim()) {
      return res.status(400).json({ error: 'Le contenu de la mission est vide.' });
    }

    const callGemini = async (sysPrompt, promptText, temp) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysPrompt }] },
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: temp }
          })
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || `Erreur Gemini HTTP ${response.status}`);
      }

      const text = data?.candidates?.[0]?.content?.parts
        ?.map(p => p?.text || '')
        .join('\n')
        .trim();

      if (!text) {
        throw new Error('Réponse IA vide.');
      }
      return text;
    };

    const temp = serviceTier === 'pro' ? 0.35 : 0.25;
    const primaryOutput = await callGemini(systemInstruction, String(input).trim(), temp);

    if (!multiAgent || !Array.isArray(companionPrompts) || companionPrompts.length === 0) {
      return res.status(200).json({
        output: primaryOutput,
        steps: []
      });
    }

    const steps = [];
    let currentDraft = primaryOutput;

    for (const peer of companionPrompts) {
      const peerTitle = peer?.title || 'Agent complémentaire';
      const peerSys = peer?.systemPrompt || systemInstruction;
      const peerText = await callGemini(
        peerSys,
        `Mission initiale :\n${String(input).trim()}\n\nLivrable à contrôler / structurer :\n${currentDraft}`,
        0.3
      );
      steps.push({ title: peerTitle, output: peerText });
    }

    const combined = [
      `=== Agent principal ===\n${primaryOutput}`,
      ...steps.map(s => `=== ${s.title} ===\n${s.output}`)
    ].join('\n\n');

    return res.status(200).json({
      output: combined,
      steps
    });
  } catch (err) {
    return res.status(502).json({
      error: err?.message || 'Erreur serveur lors de l’appel à l’IA.'
    });
  }
}

