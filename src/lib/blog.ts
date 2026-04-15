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
      "7A, 5A, or 5B? Extended or standard? Here's everything you need to know about picking the perfect stick for your playing style.",
    content: `
Choosing the right drumstick is one of the most important decisions a drummer can make. The stick you play with affects your tone, volume, speed, and comfort behind the kit. Here's a breakdown of our sizes and who they're best for.

## 7A — Light & Fast

The 7A is our lightest stick — slimmer than a 5A, built for speed and finesse. If you play quiet gigs, jazz, or anything that calls for a light touch, this is your stick.

**Best for:** Jazz, light-touch styles, practice, quieter venues

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

Our sticks come in a full range of finishes — Natural, Black, Pink, Red, Green, Blue, Yellow, plus our premium Silver Blade edition. The finish is purely cosmetic — same wood, same weight, same performance. Pick the color that matches your personality.

## Our Recommendation

Start with a pair of 5A Naturals. They're the benchmark. Once you know how they feel, you'll know exactly what direction to go — lighter (7A), heavier (5B), longer (EX5A/EX5B), or more colourful.
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
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
