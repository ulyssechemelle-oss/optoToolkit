export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method === "GET") return new Response("Worker opto IA actif.", { status: 200, headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, 405, corsHeaders);

    try {
      const body = await request.json();
      const imageBase64 = body.imageBase64;
      const oeil = body.oeil || "";
      const measurements = body.measurements || {};

      if (!imageBase64) return jsonResponse({ error: "Aucune image reçue." }, 400, corsHeaders);

      const prompt = `
Tu es un assistant pédagogique en optométrie/contactologie.
Analyse la photo de l'œil ${oeil} comme observation externe/segment antérieur.
Ne pose pas de diagnostic médical. Décris uniquement ce qui est visible.

Utilise obligatoirement la gradation selon l'échelle d'Efron de 0 à 4 :
0 = normal/absent
1 = trace/léger
2 = modéré
3 = marqué
4 = sévère

Recherche explicitement :
- qualité de l'image ;
- présence visible d'une lentille de contact sur l'œil : oui / non / non évaluable ;
- indices de lentille : bord circulaire, reflets, zone optique, dépôts, mouillabilité ;
- rougeur conjonctivale bulbaire : grade Efron 0 à 4 ;
- rougeur limbique : grade Efron 0 à 4 ;
- paupières, bord libre et cils : grade Efron 0 à 4 ;
- pinguecula : absente / possible / présente / non évaluable ;
- ptérygion : non / possible / non évaluable ;
- cornée : claire / anomalie possible / non évaluable ;
- signes d'alerte.

Mesures manuelles disponibles :
${JSON.stringify(measurements, null, 2)}

Réponds uniquement avec ce format lisible :

Qualité image :
Lentille visible :
Indices de lentille :
Rougeur conjonctivale bulbaire — Efron :
Rougeur limbique — Efron :
Paupières / bord libre — Efron :
Pinguecula :
Ptérygion :
Cornée :
Conclusion :
Signes d’alerte :

Pour la dernière ligne :
- s’il n’y a aucun signe d’alerte, écris exactement : Signes d’alerte : pas de signe
- s’il y en a un, écris : Signes d’alerte : <signe concerné>

Ne mets pas de JSON. Ne mets pas de balises <json>.`;

      const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: imageBase64 }
            ]
          }]
        })
      });

      const data = await openaiResponse.json();
      if (!openaiResponse.ok) return jsonResponse({ error: "Erreur OpenAI", details: data }, openaiResponse.status, corsHeaders);

      const avis = extractText(data);
      return jsonResponse({ avis: avis || "Réponse IA vide ou non lisible." }, 200, corsHeaders);

    } catch (error) {
      return jsonResponse({ error: error.message }, 500, corsHeaders);
    }
  }
};

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function extractText(data) {
  if (data.output_text) return data.output_text;
  try {
    if (Array.isArray(data.output)) {
      const texts = [];
      for (const item of data.output) {
        if (Array.isArray(item.content)) {
          for (const content of item.content) {
            if ((content.type === "output_text" || content.type === "text") && content.text) texts.push(content.text);
          }
        }
      }
      return texts.join("\n\n").trim();
    }
  } catch (e) {}
  return "";
}
