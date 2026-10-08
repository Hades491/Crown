export const LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)' },
  { code: 'mr-IN', label: 'मराठी (Marathi)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
];
export const VOICES = ['female', 'male'];
export const ACTIONS = ['say', 'link'];

// Phrases the system itself says, in each language.
export const PHRASES = {
  en: { unavailable: 'This service is no longer available.', sorry: "Sorry, I didn't catch that.", again: 'To hear the options again, press 0. Otherwise, you can hang up.', bye: 'Thank you for calling. Goodbye.' },
  hi: { unavailable: 'यह सेवा अब उपलब्ध नहीं है।', sorry: 'क्षमा करें, मैं समझ नहीं पाया।', again: 'विकल्प दोबारा सुनने के लिए 0 दबाएँ। अन्यथा आप फ़ोन रख सकते हैं।', bye: 'कॉल करने के लिए धन्यवाद। नमस्ते।' },
  ta: { unavailable: 'இந்தச் சேவை இனி கிடைக்காது.', sorry: 'மன்னிக்கவும், எனக்குப் புரியவில்லை.', again: 'விருப்பங்களை மீண்டும் கேட்க 0 ஐ அழுத்தவும். இல்லையெனில் அழைப்பைத் துண்டிக்கலாம்.', bye: 'அழைத்ததற்கு நன்றி. வணக்கம்.' },
  te: { unavailable: 'ఈ సేవ ఇకపై అందుబాటులో లేదు.', sorry: 'క్షమించండి, నాకు అర్థం కాలేదు.', again: 'ఎంపికలను మళ్లీ వినడానికి 0 నొక్కండి. లేకపోతే మీరు కాల్ ముగించవచ్చు.', bye: 'కాల్ చేసినందుకు ధన్యవాదాలు. నమస్కారం.' },
  bn: { unavailable: 'এই পরিষেবাটি আর উপলব্ধ নেই।', sorry: 'দুঃখিত, আমি বুঝতে পারিনি।', again: 'বিকল্পগুলি আবার শুনতে ০ চাপুন। না হলে আপনি ফোন রেখে দিতে পারেন।', bye: 'ফোন করার জন্য ধন্যবাদ। বিদায়।' },
  mr: { unavailable: 'ही सेवा आता उपलब्ध नाही.', sorry: 'क्षमा करा, मला समजले नाही.', again: 'पर्याय पुन्हा ऐकण्यासाठी 0 दाबा. अन्यथा तुम्ही फोन ठेवू शकता.', bye: 'फोन केल्याबद्दल धन्यवाद. नमस्कार.' },
  es: { unavailable: 'Este servicio ya no está disponible.', sorry: 'Lo siento, no te he entendido.', again: 'Para volver a escuchar las opciones, pulsa 0. Si no, puedes colgar.', bye: 'Gracias por llamar. Adiós.' },
  fr: { unavailable: "Ce service n'est plus disponible.", sorry: "Désolé, je n'ai pas compris.", again: 'Pour réécouter les options, appuyez sur 0. Sinon, vous pouvez raccrocher.', bye: 'Merci de votre appel. Au revoir.' },
  de: { unavailable: 'Dieser Service ist nicht mehr verfügbar.', sorry: 'Entschuldigung, das habe ich nicht verstanden.', again: 'Um die Optionen erneut zu hören, drücken Sie 0. Sonst können Sie auflegen.', bye: 'Danke für Ihren Anruf. Auf Wiedersehen.' },
};
export const phrasesFor = (lang) => PHRASES[lang.split('-')[0]] || PHRASES.en;

// Spoken words that mean a keypad digit.
export const SPOKEN = {
  1: ['1', 'one', 'won', 'first', 'ek', 'एक', 'ஒன்று', 'ondru', 'এক', 'ఒకటి', 'okati', 'uno', 'un', 'une', 'eins', 'पहला', 'पहले'],
  2: ['2', 'two', 'to', 'too', 'second', 'do', 'दो', 'இரண்டு', 'erandu', 'দুই', 'రెండు', 'rendu', 'dos', 'deux', 'zwei', 'दूसरा'],
  0: ['0', 'zero', 'menu', 'repeat', 'again', 'शून्य', 'cero', 'zéro', 'null'],
};
