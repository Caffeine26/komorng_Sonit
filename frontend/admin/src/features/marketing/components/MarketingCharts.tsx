import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Loader2 } from 'lucide-react';

interface EngagementTrendChartProps {
  data?: any[];
  isLoading: boolean;
}

export function EngagementTrendChart({ data, isLoading }: EngagementTrendChartProps) {
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-[14px]">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
        <XAxis 
          dataKey="date" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
          dy={10}
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
        />
        <Tooltip 
          contentStyle={{ borderRadius: '16px', border: '1px solid #f4f4f5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        />
        <Area type="monotone" dataKey="sent" name="Sent" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorSent)" />
        <Area type="monotone" dataKey="opened" name="Opened" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorOpened)" />
        <Area type="monotone" dataKey="clicked" name="Clicked" stroke="#3b82f6" strokeWidth={2} fill="none" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface EngagementBreakdownChartProps {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  isLoading: boolean;
}

export function EngagementBreakdownChart({ totalSent, totalOpened, totalClicked, isLoading }: EngagementBreakdownChartProps) {
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  const data = [
    { name: 'Sent (Unopened)', value: Math.max(0, totalSent - totalOpened) },
    { name: 'Opened (Unclicked)', value: Math.max(0, totalOpened - totalClicked) },
    { name: 'Clicked', value: totalClicked }
  ].filter(d => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-[14px]">
        No engagement data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={80}
          outerRadius={120}
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.name === 'Clicked' ? '#3b82f6' : entry.name === 'Opened (Unclicked)' ? '#10b981' : '#f97316'} 
            />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ borderRadius: '16px', border: '1px solid #f4f4f5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ color: '#18181b', fontWeight: 500 }}
        />
        <Legend verticalAlign="bottom" height={36} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
