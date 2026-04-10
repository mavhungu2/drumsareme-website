"use client";

import { useState, type FormEvent } from "react";
import { Send, MessageCircle, MapPin, Clock } from "lucide-react";

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    subject: "general",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const { name, email, subject, message } = formState;
    const body = `Name: ${name}%0AEmail: ${email}%0ASubject: ${subject}%0A%0A${message}`;
    window.open(
      `https://wa.me/27815569966?text=${encodeURIComponent(`New website enquiry\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`)}`,
      "_blank"
    );
    setSubmitted(true);
  };

  return (
    <>
      <section className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-4">
            Contact
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Let&apos;s Talk
          </h1>
          <p className="text-lg text-muted max-w-2xl">
            Got questions about our sticks? Need a bulk order? Want to stock
            #DrumsAreMe? Drop us a message.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-12 lg:gap-20">
            {/* Contact Info */}
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-xl font-bold mb-6">Get in Touch</h2>
                <div className="space-y-5">
                  <a
                    href="https://wa.me/27815569966"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-4 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageCircle size={18} className="text-green" />
                    </div>
                    <div>
                      <p className="font-medium group-hover:text-green transition-colors">
                        081 556 9966
                      </p>
                      <p className="text-sm text-muted">WhatsApp</p>
                    </div>
                  </a>
                  <a
                    href="https://wa.me/27832000673"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-4 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageCircle size={18} className="text-green" />
                    </div>
                    <div>
                      <p className="font-medium group-hover:text-green transition-colors">
                        083 200 0673
                      </p>
                      <p className="text-sm text-muted">WhatsApp</p>
                    </div>
                  </a>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin size={18} className="text-muted" />
                    </div>
                    <div>
                      <p className="font-medium">South Africa</p>
                      <p className="text-sm text-muted">Nationwide delivery</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center shrink-0 mt-0.5">
                      <Clock size={18} className="text-muted" />
                    </div>
                    <div>
                      <p className="font-medium">Mon – Sat</p>
                      <p className="text-sm text-muted">8:00 AM – 6:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-border rounded-2xl p-6 bg-surface">
                <h3 className="font-semibold mb-2">Bulk & Wholesale</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Drum schools, churches, and retailers — ask about our brick
                  deals (12 pairs for R1,600) and custom wholesale pricing.
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-3">
              {submitted ? (
                <div className="border border-green/20 bg-green/5 rounded-2xl p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-4">
                    <Send size={20} className="text-green" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Message Sent!</h3>
                  <p className="text-muted">
                    We&apos;ve opened WhatsApp with your message. We&apos;ll get back to
                    you as soon as possible.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-6 text-sm font-medium text-accent hover:text-accent-dark transition-colors"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium mb-1.5"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        value={formState.name}
                        onChange={(e) =>
                          setFormState({ ...formState, name: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground transition-colors"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium mb-1.5"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        value={formState.email}
                        onChange={(e) =>
                          setFormState({ ...formState, email: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground transition-colors"
                        placeholder="you@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="subject"
                      className="block text-sm font-medium mb-1.5"
                    >
                      Subject
                    </label>
                    <select
                      id="subject"
                      value={formState.subject}
                      onChange={(e) =>
                        setFormState({ ...formState, subject: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground transition-colors"
                    >
                      <option value="general">General Enquiry</option>
                      <option value="order">Place an Order</option>
                      <option value="bulk">Bulk / Wholesale</option>
                      <option value="retail">Retail Partnership</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium mb-1.5"
                    >
                      Message
                    </label>
                    <textarea
                      id="message"
                      required
                      rows={5}
                      value={formState.message}
                      onChange={(e) =>
                        setFormState({ ...formState, message: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground transition-colors resize-none"
                      placeholder="Tell us what you need..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
                  >
                    Send via WhatsApp
                    <Send size={16} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
