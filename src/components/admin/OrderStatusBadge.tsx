import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/admin/orders-types";
import { ORDER_STATUS_CLASSES } from "@/lib/admin/format";

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export default function OrderStatusBadge({
  status,
  className = "",
}: OrderStatusBadgeProps) {
  const base =
    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border";
  return (
    <span
      className={`${base} ${ORDER_STATUS_CLASSES[status]} ${className}`.trim()}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
