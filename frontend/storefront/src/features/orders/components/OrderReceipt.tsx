import React from 'react';

interface OrderReceiptProps {
  orderId: string;
  date: string;
  time: string;
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  totalAmount: number;
  status: string;
  tableName?: string;
  showGif?: boolean;
}

export function OrderReceipt({
  orderId,
  date,
  time,
  items,
  totalAmount,
  status,
  tableName,
  showGif
}: OrderReceiptProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
      <div className="flex justify-between border-b border-zinc-100 pb-4 mb-4">
        <div>
          <p className="text-sm text-zinc-500">Order ID</p>
          <p className="font-bold">#{orderId}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-500">{date}</p>
          <p className="text-sm text-zinc-500">{time}</p>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <div>
              <span className="font-bold">{item.quantity}x</span> {item.name}
            </div>
            <div>${item.price.toFixed(2)}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-100 pt-4 flex justify-between font-bold text-lg">
        <span>Total</span>
        <span>${totalAmount.toFixed(2)}</span>
      </div>

      <div className="mt-6 pt-4 border-t border-zinc-100">
        <div className="flex justify-between items-center">
          <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
            {status}
          </span>
          {tableName && (
            <span className="text-sm font-medium text-zinc-600">
              Table {tableName}
            </span>
          )}
        </div>
      </div>

      {showGif && (
        <div className="mt-4 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-zinc-100 animate-pulse" />
        </div>
      )}
    </div>
  );
}
