"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  AdminApiError,
  createProduct as apiCreateProduct,
  updateProduct as apiUpdateProduct,
} from "@/lib/admin/api-client";
import type {
  CreateProductInput,
  ProductListItem,
} from "@/lib/admin/products-types";

interface ProductFormProps {
  initial: ProductListItem | null; // null = create
  onSaved: (product: ProductListItem) => void;
  onCancel: () => void;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface FormState {
  slug: string;
  name: string;
  size: string;
  color: string;
  price: string;
  description: string;
  features: string;
  image: string;
  inStock: boolean;
  sortOrder: string;
}

function toFormState(item: ProductListItem | null): FormState {
  if (!item) {
    return {
      slug: "",
      name: "",
      size: "",
      color: "",
      price: "",
      description: "",
      features: "",
      image: "",
      inStock: true,
      sortOrder: "999",
    };
  }
  return {
    slug: item.slug,
    name: item.name,
    size: item.size,
    color: item.color,
    price: String(item.price),
    description: item.description,
    features: item.features.join("\n"),
    image: item.image,
    inStock: item.inStock,
    sortOrder: String(item.sortOrder),
  };
}

export default function ProductForm({
  initial,
  onSaved,
  onCancel,
}: ProductFormProps) {
  const slugId = useId();
  const nameId = useId();
  const sizeId = useId();
  const colorId = useId();
  const priceId = useId();
  const descId = useId();
  const featuresId = useId();
  const imageId = useId();
  const sortId = useId();

  const [state, setState] = useState<FormState>(() => toFormState(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState(toFormState(initial));
  }, [initial]);

  const isCreate = initial === null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const slug = state.slug.trim();
    const name = state.name.trim();
    const size = state.size.trim();
    const color = state.color.trim();
    const description = state.description.trim();
    const image = state.image.trim();
    const features = state.features
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    const price = Number.parseFloat(state.price);
    const sortOrder = Number.parseInt(state.sortOrder, 10);

    if (!slug) return setError("Slug is required.");
    if (!SLUG_PATTERN.test(slug)) {
      return setError(
        "Slug must be lowercase alphanumeric with single hyphens (e.g. 5a-natural).",
      );
    }
    if (!name) return setError("Name is required.");
    if (!size) return setError("Size is required.");
    if (!color) return setError("Color is required.");
    if (!Number.isFinite(price) || price < 0) {
      return setError("Price must be a non-negative number.");
    }
    if (!description) return setError("Description is required.");
    if (!image) return setError("Image path is required.");
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return setError("Sort order must be a non-negative integer.");
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateProductInput = {
        slug,
        name,
        size,
        color,
        price,
        description,
        features,
        image,
        inStock: state.inStock,
        sortOrder,
      };
      const saved = isCreate
        ? await apiCreateProduct(payload)
        : await apiUpdateProduct(initial!.id, {
            name,
            size,
            color,
            price,
            description,
            features,
            image,
            inStock: state.inStock,
            sortOrder,
          });
      onSaved(saved);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {isCreate ? "New product" : `Edit ${initial!.name}`}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label
          htmlFor={slugId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Slug (URL identifier — cannot change after create)</span>
          <input
            id={slugId}
            type="text"
            value={state.slug}
            onChange={(e) => update("slug", e.target.value)}
            disabled={!isCreate}
            placeholder="5a-natural"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={nameId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Name</span>
          <input
            id={nameId}
            type="text"
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={sizeId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Size</span>
          <input
            id={sizeId}
            type="text"
            value={state.size}
            onChange={(e) => update("size", e.target.value)}
            placeholder="5A, 7A, EX5B…"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={colorId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Color</span>
          <input
            id={colorId}
            type="text"
            value={state.color}
            onChange={(e) => update("color", e.target.value)}
            placeholder="Natural, Black, Silver Blade…"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={priceId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Price (ZAR)</span>
          <input
            id={priceId}
            type="number"
            min={0}
            step={0.01}
            value={state.price}
            onChange={(e) => update("price", e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={sortId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Sort order (lower = first)</span>
          <input
            id={sortId}
            type="number"
            min={0}
            step={1}
            value={state.sortOrder}
            onChange={(e) => update("sortOrder", e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={imageId}
          className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2"
        >
          <span>Image path (relative to /public)</span>
          <input
            id={imageId}
            type="text"
            value={state.image}
            onChange={(e) => update("image", e.target.value)}
            placeholder="/images/gallery/IMG_7489.jpg"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={descId}
          className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2"
        >
          <span>Description</span>
          <textarea
            id={descId}
            rows={3}
            value={state.description}
            onChange={(e) => update("description", e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={featuresId}
          className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2"
        >
          <span>Features (one per line)</span>
          <textarea
            id={featuresId}
            rows={5}
            value={state.features}
            onChange={(e) => update("features", e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={state.inStock}
            onChange={(e) => update("inStock", e.target.checked)}
            className="h-4 w-4 rounded border-border text-foreground focus:ring-accent"
          />
          In stock (visible on store)
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface disabled:opacity-60 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Saving…
            </>
          ) : isCreate ? (
            "Create product"
          ) : (
            "Save changes"
          )}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
