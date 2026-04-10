export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  readTime: string;
  image: string;
  category: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "choosing-the-right-drumstick-size",
    title: "How to Choose the Right Drumstick Size",
    excerpt:
      "5A or 5B? Extended or standard? Here's everything you need to know about picking the perfect stick for your playing style.",
    content: `
Choosing the right drumstick is one of the most important decisions a drummer can make. The stick you play with affects your tone, volume, speed, and comfort behind the kit. Here's a breakdown of our sizes and who they're best for.

## 5A — The All-Rounder

The 5A is the most popular drumstick size in the world, and for good reason. It offers the perfect balance of weight and speed, making it suitable for virtually any genre. If you're unsure where to start, this is your stick.

**Best for:** Pop, rock, jazz, worship, practice, beginners

## 5B — The Power Stick

The 5B is slightly thicker and heavier than the 5A, giving you more mass behind every stroke. If you play loud music or find yourself breaking 5As regularly, the 5B delivers the durability and volume you need.

**Best for:** Rock, metal, marching, heavy hitters

## EX5A — Extended Reach, 5A Feel

Same diameter as the 5A, but with extra length. The EX5A gives you more leverage and reach across your kit without changing the familiar feel of a standard 5A.

**Best for:** Larger kits, players who want more reach, versatile drummers

## EX5B — Maximum Everything

The biggest stick in our range. Combines the 5B's extra mass with extended length for maximum power and projection. This is the stick for drummers who want to be felt, not just heard.

**Best for:** Heavy music, marching, stadium shows

## The Color Question

All our sticks come in Natural, Black, and Pink finishes. The finish is purely cosmetic — same wood, same weight, same performance. Pick the color that matches your personality.

## Our Recommendation

Start with a pair of 5A Naturals. They're the benchmark. Once you know how they feel, you'll know exactly what direction to go — lighter, heavier, longer, or more colourful.
    `.trim(),
    date: "2026-03-15",
    readTime: "4 min read",
    image: "/images/gallery/20260110_170247.jpg",
    category: "Guide",
  },
  {
    slug: "why-american-hickory",
    title: "Why American Hickory Is the Gold Standard",
    excerpt:
      "Not all wood is created equal. Here's why we chose American Hickory for every pair of Keep Time Studio drumsticks.",
    content: `
When it comes to drumstick wood, three species dominate the market: Hickory, Maple, and Oak. We chose American Hickory for every pair of Keep Time Studio sticks, and here's why.

## The Big Three

**Hickory** — The perfect middle ground. Strong, durable, and shock-absorbent. Hickory dampens vibration better than any other drumstick wood, which means less fatigue during long sessions.

**Maple** — Lighter than Hickory. Great for low-volume playing and fast work. The trade-off: it breaks more easily and doesn't absorb shock as well.

**Oak** — Heavier and denser than Hickory. Extremely durable but transmits more vibration to your hands. Can lead to fatigue and injury over long periods.

## Why Hickory Wins

Hickory hits the sweet spot. It's dense enough to project well and durable enough to last, but flexible enough to absorb the shock of rimshots and hard playing. It's the reason 90% of professional drummers choose Hickory sticks.

American Hickory specifically has a tighter, more consistent grain than its Asian or European counterparts. This means better weight matching between pairs, more predictable response, and longer lifespan.

## Our Sourcing

Every pair of Keep Time Studio sticks is turned from kiln-dried American Hickory. The wood is selected for straight grain and consistent density, then precision-turned to our specifications. The result: sticks that feel right from the first stroke.

## Good Wood, Perfected

We didn't reinvent the drumstick. We just made sure every pair meets the standard that serious drummers expect — at a price that makes sense for South African musicians.
    `.trim(),
    date: "2026-02-28",
    readTime: "3 min read",
    image: "/images/gallery/20260110_170314.jpg",
    category: "Education",
  },
  {
    slug: "brick-deal-explained",
    title: "The Brick Deal: Why Every Serious Drummer Needs One",
    excerpt:
      "12 pairs for R1,600. Here's why buying in bulk is the smartest move for working drummers, drum schools, and worship teams.",
    content: `
If you go through drumsticks regularly — and let's be honest, most of us do — buying single pairs gets expensive fast. That's why we created the Brick Deal.

## What's a Brick?

A brick is 12 pairs of drumsticks. It's an industry-standard bulk unit, and it's the smartest way to buy sticks if you play regularly.

## The Numbers

- **Single pair:** R150
- **12 pairs (brick):** R1,600
- **You save:** R200 per brick
- **Per pair in a brick:** R133

That's a saving of R16.67 per pair. Over a year, that adds up significantly.

## Who Benefits Most?

**Working Drummers** — If you gig regularly, you're going through sticks fast. A brick keeps you stocked without constant reordering.

**Drum Schools** — Teaching drums means students need sticks. A brick deal keeps your school supplied at the lowest per-pair cost.

**Worship Teams** — Churches with multiple drummers can stock the drum room and keep everyone playing with quality sticks.

**Session Drummers** — When you're in the studio, the last thing you want is a stick breaking mid-take with no backup.

## Mix and Match

You can mix sizes and colours within a brick. Want 6 pairs of 5A Natural and 6 pairs of 5A Black? No problem. We'll build your brick to order.

## How to Order

Simply WhatsApp us at 081 556 9966 or 083 200 0673 with your brick order. We'll sort payment and delivery.
    `.trim(),
    date: "2026-02-10",
    readTime: "3 min read",
    image: "/images/products/drumsticks-sale.png",
    category: "Tips",
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
