const spatialVibes = [
  [/silent ache/i, "Quiet · Minimal · Restorative"],
  [/wounded dreamer/i, "Dreamy · Layered · Reflective"],
  [/fragile survivor/i, "Sheltered · Grounded · Gentle"],
  [/quiet keeper/i, "Reflective · Textured · Quiet"],
  [/searching soul/i, "Flexible · Curious · Modular"],
  [/restless heart/i, "Dynamic · Flexible · Energizing"],
  [/hidden flame/i, "Focused · Grounded · Bold"],
  [/gentle healer/i, "Botanical · Soft · Restorative"],
  [/resilient wanderer/i, "Durable · Open · Grounded"],
  [/shattered light/i, "Soft · Layered · Reassuring"],
  [/quiet fighter/i, "Structured · Focused · Warm"],
  [/gentle dreamer/i, "Airy · Soft · Imaginative"],
  [/radiant spirit/i, "Expressive · Bright · Playful"],
  [/brave heart/i, "Bold · Confident · Grounded"],
  [/inner flame/i, "Creative · Focused · Expressive"],
  [/guiding light/i, "Calm · Thoughtful · Balanced"],
  [/boundless dreamer/i, "Expansive · Imaginative · Open"],
  [/brave creator/i, "Expressive · Vivid · Creative"],
  [/compassionate flame/i, "Warm · Connected · Welcoming"],
  [/luminous soul/i, "Minimal · Calm · Airy"]
];

export function getSpatialVibe(archetypeName) {
  return spatialVibes.find(([pattern]) => pattern.test(archetypeName))?.[1] || "Calm · Balanced · Personal";
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  let line = "";
  let lineCount = 0;
  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width > maxWidth && line) {
      context.fillText(line, x, y + lineCount * lineHeight);
      lineCount++;
      line = word;
      if (lineCount === maxLines - 1) break;
    } else {
      line = nextLine;
    }
  }
  if (lineCount < maxLines && line) context.fillText(line, x, y + lineCount * lineHeight);
}

function drawShareCard({ archetypeName, colors, vibe, siteUrl }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create an image card.");

  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#26372d");
  background.addColorStop(0.48, "#17231d");
  background.addColorStop(1, "#3a4030");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const glow = context.createRadialGradient(850, 230, 20, 850, 230, 700);
  glow.addColorStop(0, "rgba(218, 197, 145, 0.25)");
  glow.addColorStop(1, "rgba(218, 197, 145, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  roundedRect(context, 48, 48, 984, 1824, 32);
  context.strokeStyle = "rgba(247, 246, 232, 0.28)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#ead8a5";
  context.font = "700 28px Arial, sans-serif";
  context.letterSpacing = "5px";
  context.fillText("MAWAESU", 104, 144);
  context.fillStyle = "rgba(247, 246, 232, 0.68)";
  context.font = "500 20px Arial, sans-serif";
  context.letterSpacing = "3px";
  context.fillText("SELF-DISCOVERY  /  PERSONAL SPACE", 104, 184);

  context.fillStyle = "rgba(247, 246, 232, 0.68)";
  context.font = "700 22px Arial, sans-serif";
  context.letterSpacing = "4px";
  context.fillText("YOUR ARCHETYPE", 104, 354);

  const title = archetypeName.replace(/^\P{L}+/u, "").trim();
  context.fillStyle = "#f7f3e7";
  context.font = "600 76px Georgia, 'Times New Roman', serif";
  context.letterSpacing = "0px";
  wrapText(context, title, 100, 464, 870, 94, 2);

  context.fillStyle = "rgba(247, 246, 232, 0.62)";
  context.font = "400 27px Arial, sans-serif";
  context.fillText("A palette and spatial mood shaped around you.", 104, 690);

  context.fillStyle = "#ead8a5";
  context.font = "700 22px Arial, sans-serif";
  context.letterSpacing = "4px";
  context.fillText("YOUR PRIMARY PALETTE", 104, 858);

  const swatchColors = colors.filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 5);
  const swatchWidth = 164;
  const swatchGap = 18;
  swatchColors.forEach((color, index) => {
    const x = 104 + index * (swatchWidth + swatchGap);
    roundedRect(context, x, 904, swatchWidth, 168, 18);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = "rgba(247, 246, 232, 0.78)";
    context.font = "500 18px Arial, sans-serif";
    context.letterSpacing = "1px";
    context.fillText(color.toUpperCase(), x, 1112);
  });

  context.strokeStyle = "rgba(247, 246, 232, 0.2)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(104, 1220);
  context.lineTo(976, 1220);
  context.stroke();

  context.fillStyle = "#ead8a5";
  context.font = "700 22px Arial, sans-serif";
  context.letterSpacing = "4px";
  context.fillText("YOUR SPATIAL VIBE", 104, 1300);
  context.fillStyle = "#f7f3e7";
  context.font = "600 48px Georgia, 'Times New Roman', serif";
  context.letterSpacing = "0px";
  wrapText(context, vibe, 104, 1390, 850, 68, 2);

  context.fillStyle = "rgba(247, 246, 232, 0.7)";
  context.font = "400 25px Arial, sans-serif";
  context.fillText("Make a little room for what feels like you.", 104, 1608);

  context.strokeStyle = "rgba(247, 246, 232, 0.2)";
  context.beginPath();
  context.moveTo(104, 1740);
  context.lineTo(976, 1740);
  context.stroke();
  context.fillStyle = "#ead8a5";
  context.font = "600 24px Arial, sans-serif";
  context.letterSpacing = "1px";
  context.fillText(siteUrl.replace(/^https?:\/\//, ""), 104, 1804);

  return canvas;
}

export function createFlexCardBlob(options) {
  const { archetypeName, colors, vibe, siteUrl } = options;
  if (!archetypeName || !Array.isArray(colors) || !vibe || !siteUrl) {
    return Promise.reject(new Error("Your archetype, palette, and spatial vibe are required."));
  }
  const canvas = drawShareCard(options);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("The share card could not be exported as a PNG."));
    }, "image/png");
  });
}

export function downloadFlexCard(blob) {
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = "mawaesu-archetype.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
