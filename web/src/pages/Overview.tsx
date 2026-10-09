import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { fetchOverview } from '../api/client';
import { formatCost, formatTokens, rangeToParams, type RangeOption } from '../lib/format';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';

interface OverviewProps {
  range: RangeOption;
}

export const Overview: React.FC<OverviewProps> = ({ range }) => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['overview', range],
    queryFn: () => fetchOverview(range),
  });

  if (isLoading) {
    return (
      <div className="overview-loading">
        <div className="loading-spinner" />
        <span>Loading telemetry metrics...</span>
      </div>
    );
  }

  if (isError) {
    return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  }

  if (!data) {
    return <EmptyState />;
  }

  const { totals, series, byModel } = data;
  const { bucket } = rangeToParams(range);

  const isEmpty =
    totals.costUsd === 0 &&
    totals.inputTokens === 0 &&
    totals.outputTokens === 0 &&
    totals.sessions === 0 &&
    totals.toolCalls === 0 &&
    totals.errorRate === 0 &&
    series.length === 0;

  if (isEmpty) {
    return <EmptyState />;
  }

  const formatTimeTick = (iso: string) => {
    try {
      const d = new Date(iso);
      if (bucket === 'hour') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="overview-page">
      {/* Stat Cards Grid */}
      <div className="stats-grid">
        <StatCard
          title="Total Cost"
          value={formatCost(totals.costUsd)}
          subtitle="Estimated API spend"
          icon={<DollarSign size={18} className="text-emerald" />}
        />
        <StatCard
          title="Input Tokens"
          value={formatTokens(totals.inputTokens)}
          subtitle="Prompt & context"
          icon={<ArrowDownLeft size={18} className="text-blue" />}
        />
        <StatCard
          title="Output Tokens"
          value={formatTokens(totals.outputTokens)}
          subtitle="Model responses"
          icon={<ArrowUpRight size={18} className="text-purple" />}
        />
        <StatCard
          title="Sessions"
          value={formatTokens(totals.sessions)}
          subtitle="Distinct conversations"
          icon={<Layers size={18} className="text-amber" />}
        />
        <StatCard
          title="Tool Calls"
          value={formatTokens(totals.toolCalls)}
          subtitle="Bash, Read, Edit, etc."
          icon={<Wrench size={18} className="text-teal" />}
        />
        <StatCard
          title="Error Rate"
          value={`${(totals.errorRate * 100).toFixed(1)}%`}
          subtitle="API & tool failures"
          icon={<AlertTriangle size={18} className={totals.errorRate > 0 ? 'text-rose' : 'text-zinc'} />}
        />
      </div>

      {/* Time Series Charts */}
      <div className="charts-grid">
        {/* Cost Over Time */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Cost Over Time</h3>
            <span className="chart-card-badge">USD</span>
          </div>
          <div className="chart-wrapper">
            {series.length === 0 ? (
              <div className="chart-empty">No series points in range</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={formatTimeTick}
                    stroke="#71717a"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: '#27272a',
                      borderRadius: '6px',
                      color: '#fafafa',
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    formatter={(value: any) => [formatCost(Number(value) || 0), 'Cost']}
                  />
                  <Area
                    type="monotone"
                    dataKey="costUsd"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#costGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tokens Over Time */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Tokens Over Time</h3>
            <span className="chart-card-badge">Total Tokens</span>
          </div>
          <div className="chart-wrapper">
            {series.length === 0 ? (
              <div className="chart-empty">No series points in range</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={formatTimeTick}
                    stroke="#71717a"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v) => formatTokens(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: '#27272a',
                      borderRadius: '6px',
                      color: '#fafafa',
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    formatter={(value: any) => [formatTokens(Number(value) || 0), 'Tokens']}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#tokensGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Cost by Model */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title">Cost by Model</h3>
          <span className="chart-card-badge">Spend breakdown</span>
        </div>
        <div className="chart-wrapper">
          {byModel.length === 0 ? (
            <div className="chart-empty">No model usage in selected range</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byModel} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="model"
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '6px',
                    color: '#fafafa',
                  }}
                  formatter={(value: any) => [formatCost(Number(value) || 0), 'Cost']}
                />
                <Bar dataKey="costUsd" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
