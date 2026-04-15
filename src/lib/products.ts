export interface Product {
  id: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  price: number;
  description: string;
  features: string[];
  image: string;
  inStock: boolean;
}

export const products: Product[] = [
  // 7A — lightest, fastest stick
  {
    id: "7a-natural",
    slug: "7a-natural",
    name: "Keep Time 7A - Natural",
    size: "7A",
    color: "Natural",
    price: 150,
    description:
      "The 7A is our lightest stick — ideal for jazz, light touch playing, and drummers who value speed over volume. Same premium American Hickory, in a slimmer profile.",
    features: [
      "American Hickory wood",
      "Oval wood tip",
      "Light, fast profile",
      "Ideal for jazz, light-touch styles",
      "Smooth lacquer finish",
    ],
    image: "/images/gallery/IMG_7489.jpg",
    inStock: true,
  },
  {
    id: "7a-blue",
    slug: "7a-blue",
    name: "Keep Time 7A - Blue",
    size: "7A",
    color: "Blue",
    price: 150,
    description:
      "The 7A in our signature blue finish. Light, fast, and bold on stage.",
    features: [
      "American Hickory wood",
      "Vibrant blue finish",
      "Oval wood tip",
      "Light, fast profile",
      "Smooth grip coating",
    ],
    image: "/images/gallery/IMG_7494.jpg",
    inStock: true,
  },
  {
    id: "7a-green",
    slug: "7a-green",
    name: "Keep Time 7A - Green",
    size: "7A",
    color: "Green",
    price: 150,
    description:
      "The 7A in vivid green. Stand out behind the kit while keeping the quick, light 7A feel.",
    features: [
      "American Hickory wood",
      "Vivid green finish",
      "Oval wood tip",
      "Light, fast profile",
      "Smooth grip coating",
    ],
    image: "/images/gallery/IMG_7491.jpg",
    inStock: true,
  },
  {
    id: "7a-red",
    slug: "7a-red",
    name: "Keep Time 7A - Red",
    size: "7A",
    color: "Red",
    price: 150,
    description:
      "The 7A in striking red. Light, fast response with a finish that commands attention.",
    features: [
      "American Hickory wood",
      "Striking red finish",
      "Oval wood tip",
      "Light, fast profile",
      "Smooth grip coating",
    ],
    // TODO: awaiting dedicated 7A Red product photo; using 7A Natural as placeholder
    image: "/images/gallery/IMG_7489.jpg",
    inStock: true,
  },

  // 5A — the all-rounder
  {
    id: "5a-natural",
    slug: "5a-natural",
    name: "Keep Time 5A - Natural",
    size: "5A",
    color: "Natural",
    price: 150,
    description:
      "The classic 5A — the most popular drumstick size in the world. Crafted from premium American Hickory for a perfect balance of weight, response, and durability. Ideal for all genres and skill levels.",
    features: [
      "American Hickory wood",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Balanced weight distribution",
      "Smooth lacquer finish",
    ],
    image: "/images/gallery/20260110_170349.jpg",
    inStock: true,
  },
  {
    id: "5a-black",
    slug: "5a-black",
    name: "Keep Time 5A - Black",
    size: "5A",
    color: "Black",
    price: 150,
    description:
      "The classic 5A wrapped in a sleek matte black finish. Same premium American Hickory construction with a bold look that stands out on stage.",
    features: [
      "American Hickory wood",
      "Matte black finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/20260110_165902.jpg",
    inStock: true,
  },
  {
    id: "5a-pink",
    slug: "5a-pink",
    name: "Keep Time 5A - Pink",
    size: "5A",
    color: "Pink",
    price: 150,
    description:
      "Make a statement behind the kit with our bold pink 5A sticks. Same premium American Hickory feel with a vibrant finish that pops under stage lights.",
    features: [
      "American Hickory wood",
      "Vibrant pink finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/20260110_165943.jpg",
    inStock: true,
  },
  {
    id: "5a-red",
    slug: "5a-red",
    name: "Keep Time 5A - Red",
    size: "5A",
    color: "Red",
    price: 150,
    description:
      "The all-rounder 5A in bold red. Same reliable feel, more personality.",
    features: [
      "American Hickory wood",
      "Bold red finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/IMG_7485.jpg",
    inStock: true,
  },
  {
    id: "5a-green",
    slug: "5a-green",
    name: "Keep Time 5A - Green",
    size: "5A",
    color: "Green",
    price: 150,
    description:
      "The all-rounder 5A in vivid green. Classic balance and feel with a finish built for the spotlight.",
    features: [
      "American Hickory wood",
      "Vivid green finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/IMG_7483.jpg",
    inStock: true,
  },
  {
    id: "5a-blue",
    slug: "5a-blue",
    name: "Keep Time 5A - Blue",
    size: "5A",
    color: "Blue",
    price: 150,
    description:
      "The 5A in classic Keep Time blue. The world's most-played size in a bright, unmissable finish.",
    features: [
      "American Hickory wood",
      "Classic blue finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/20260110_165835.jpg",
    inStock: true,
  },
  {
    id: "5a-yellow",
    slug: "5a-yellow",
    name: "Keep Time 5A - Yellow",
    size: "5A",
    color: "Yellow",
    price: 150,
    description:
      "High-visibility yellow 5As. Catch the light and the eye — same familiar 5A balance, bright as day.",
    features: [
      "American Hickory wood",
      "Bright yellow finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/20260110_165720.jpg",
    inStock: true,
  },
  {
    id: "5a-silver-blade",
    slug: "5a-silver-blade",
    name: "Keep Time 5A - Silver Blade",
    size: "5A",
    color: "Silver Blade",
    price: 180,
    description:
      "Our premium 5A — the Silver Blade edition. Metallic sheen finish over the classic 5A profile. A step up for drummers who want their sticks to look as sharp as they play.",
    features: [
      "American Hickory wood",
      "Premium silver blade finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 14.4mm (.565\")",
      "Balanced weight distribution",
    ],
    // TODO: awaiting dedicated Silver Blade product photo; using 5A Natural as placeholder
    image: "/images/gallery/20260110_170349.jpg",
    inStock: true,
  },

  // 5B — power stick
  {
    id: "5b-natural",
    slug: "5b-natural",
    name: "Keep Time 5B - Natural",
    size: "5B",
    color: "Natural",
    price: 150,
    description:
      "The 5B delivers more power and volume for drummers who hit hard. Thicker than the 5A with more mass for heavier playing styles — rock, metal, and marching.",
    features: [
      "American Hickory wood",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 15.1mm (.595\")",
      "Extra mass for power",
      "Smooth lacquer finish",
    ],
    image: "/images/gallery/20260110_170118.jpg",
    inStock: true,
  },
  {
    id: "5b-black",
    slug: "5b-black",
    name: "Keep Time 5B - Black",
    size: "5B",
    color: "Black",
    price: 150,
    description:
      "Heavy-hitting 5B power meets bold black aesthetics. Built for drummers who demand volume and style.",
    features: [
      "American Hickory wood",
      "Matte black finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 15.1mm (.595\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/IMG_7487.jpg",
    inStock: true,
  },

  // EX5A — extended reach, 5A feel
  {
    id: "ex5a-natural",
    slug: "ex5a-natural",
    name: "Keep Time EX5A - Natural",
    size: "EX5A",
    color: "Natural",
    price: 150,
    description:
      "Extended reach with 5A feel. The EX5A gives you extra length for more leverage and reach across your kit without sacrificing the familiar 5A balance.",
    features: [
      "American Hickory wood",
      "Oval wood tip",
      "Extended length: 419mm (16.5\")",
      "Diameter: 14.4mm (.565\")",
      "Extended reach design",
      "Smooth lacquer finish",
    ],
    image: "/images/gallery/20260110_170225.jpg",
    inStock: true,
  },
  {
    id: "ex5a-black",
    slug: "ex5a-black",
    name: "Keep Time EX5A - Black",
    size: "EX5A",
    color: "Black",
    price: 150,
    description:
      "The EX5A in matte black — the classic 5A profile with extra reach and a stealth finish.",
    features: [
      "American Hickory wood",
      "Matte black finish",
      "Oval wood tip",
      "Extended length: 419mm (16.5\")",
      "Diameter: 14.4mm (.565\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/IMG_7486.jpg",
    inStock: true,
  },

  // EX5B — maximum reach, maximum power
  {
    id: "ex5b-natural",
    slug: "ex5b-natural",
    name: "Keep Time EX5B - Natural",
    size: "EX5B",
    color: "Natural",
    price: 150,
    description:
      "Maximum power, maximum reach. The EX5B combines the 5B's extra mass with extended length for the ultimate in power and projection.",
    features: [
      "American Hickory wood",
      "Oval wood tip",
      "Extended length: 419mm (16.5\")",
      "Diameter: 15.1mm (.595\")",
      "Maximum power design",
      "Smooth lacquer finish",
    ],
    image: "/images/gallery/20260110_170154.jpg",
    inStock: true,
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getProductsBySize(size: string): Product[] {
  return products.filter((p) => p.size === size);
}

export function getProductsByColor(color: string): Product[] {
  return products.filter((p) => p.color === color);
}

export const sizes = ["7A", "5A", "5B", "EX5A", "EX5B"] as const;
export const colors = [
  "Natural",
  "Black",
  "Pink",
  "Red",
  "Green",
  "Blue",
  "Yellow",
  "Silver Blade",
] as const;

export const SHIPPING_FLAT_ZAR = 100;
