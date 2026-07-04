import React from 'react';

interface OrderHistoryProps {
  orders: {
    id: string;
    date: string;
    status: string;
    totalAmount: number;
    items: { name: string; quantity: number }[];
  }[];
}

export function OrderHistory({ orders }: OrderHistoryProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-10">
        No orders found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div key={order.id} className="bg-white rounded-xl shadow-sm border border-zinc-100 p-5">
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold">#{order.id}</span>
            <span className="text-sm text-zinc-500">{order.date}</span>
          </div>
          <div className="text-sm text-zinc-600 mb-3 space-y-1">
            {order.items.map((item, idx) => (
              <div key={idx}>
                {item.quantity}x {item.name}
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-zinc-50">
            <span className="font-bold">${order.totalAmount.toFixed(2)}</span>
            <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded capitalize">
              {order.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
