export interface Product {
  id: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  price: number;
  brickPrice: number;
  brickQuantity: number;
  description: string;
  features: string[];
  image: string;
  inStock: boolean;
}

export const products: Product[] = [
  {
    id: "5a-natural",
    slug: "5a-natural",
    name: "Keep Time 5A - Natural",
    size: "5A",
    color: "Natural",
    price: 150,
    brickPrice: 1600,
    brickQuantity: 12,
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
    brickPrice: 1600,
    brickQuantity: 12,
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
    image: "/images/gallery/20260110_170351.jpg",
    inStock: true,
  },
  {
    id: "5a-pink",
    slug: "5a-pink",
    name: "Keep Time 5A - Pink",
    size: "5A",
    color: "Pink",
    price: 150,
    brickPrice: 1600,
    brickQuantity: 12,
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
    image: "/images/gallery/20260110_170406.jpg",
    inStock: true,
  },
  {
    id: "5b-natural",
    slug: "5b-natural",
    name: "Keep Time 5B - Natural",
    size: "5B",
    color: "Natural",
    price: 150,
    brickPrice: 1600,
    brickQuantity: 12,
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
    image: "/images/gallery/20260110_170024.jpg",
    inStock: true,
  },
  {
    id: "5b-black",
    slug: "5b-black",
    name: "Keep Time 5B - Black",
    size: "5B",
    color: "Black",
    price: 150,
    brickPrice: 1600,
    brickQuantity: 12,
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
    image: "/images/gallery/20260110_170432.jpg",
    inStock: true,
  },
  {
    id: "5b-pink",
    slug: "5b-pink",
    name: "Keep Time 5B - Pink",
    size: "5B",
    color: "Pink",
    price: 150,
    brickPrice: 1600,
    brickQuantity: 12,
    description:
      "Power and personality in one stick. Our 5B pink brings heavy-hitting performance wrapped in a head-turning pink finish.",
    features: [
      "American Hickory wood",
      "Vibrant pink finish",
      "Oval wood tip",
      "Length: 406mm (16\")",
      "Diameter: 15.1mm (.595\")",
      "Smooth grip coating",
    ],
    image: "/images/gallery/20260110_170420.jpg",
    inStock: true,
  },
  {
    id: "ex5a-natural",
    slug: "ex5a-natural",
    name: "Keep Time EX5A - Natural",
    size: "EX5A",
    color: "Natural",
    price: 150,
    brickPrice: 1600,
    brickQuantity: 12,
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
    image: "/images/gallery/20260110_170444.jpg",
    inStock: true,
  },
  {
    id: "ex5b-natural",
    slug: "ex5b-natural",
    name: "Keep Time EX5B - Natural",
    size: "EX5B",
    color: "Natural",
    price: 150,
    brickPrice: 1600,
    brickQuantity: 12,
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
    image: "/images/gallery/20260110_170446.jpg",
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

export const sizes = ["5A", "5B", "EX5A", "EX5B"] as const;
export const colors = ["Natural", "Black", "Pink"] as const;

export const SHIPPING_FLAT_ZAR = 100;

export function brickSku(product: Product): Product {
  return {
    ...product,
    id: `${product.id}-brick`,
    slug: `${product.slug}-brick`,
    name: `${product.name} — Brick (${product.brickQuantity} pairs)`,
    price: product.brickPrice,
  };
}
