export const AVATAR_OPTIONS = [
  { id: "leaf", label: "Leaf", symbol: "🌿", color: "#e6eee0" },
  { id: "bloom", label: "Bloom", symbol: "🌸", color: "#f6e7e9" },
  { id: "sun", label: "Sun", symbol: "☀️", color: "#f5edd7" },
  { id: "moon", label: "Moon", symbol: "🌙", color: "#e8e9f3" },
  { id: "wave", label: "Wave", symbol: "🌊", color: "#e2eef0" },
  { id: "moss", label: "Moss", symbol: "🍃", color: "#e7eee5" },
  { id: "star", label: "Star", symbol: "✨", color: "#f3ecdc" },
  { id: "flower", label: "Flower", symbol: "🌼", color: "#f4eedc" }
];

export function getAvatarOption(avatarId) {
  return AVATAR_OPTIONS.find(option => option.id === avatarId) || AVATAR_OPTIONS[0];
}
