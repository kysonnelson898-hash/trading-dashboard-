BEGIN;

CREATE TABLE IF NOT EXISTS market_alerts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (
        type IN (
            'PREVIOUS_DAY_HIGH_BREAK',
            'PREVIOUS_DAY_LOW_BREAK',
            'BULLISH_CHOCH',
            'BEARISH_CHOCH'
        )
    ),
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    candle_time BIGINT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    level DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION NOT NULL,
    average_volume DOUBLE PRECISION NOT NULL,
    volume_ratio DOUBLE PRECISION NOT NULL,
    message TEXT NOT NULL,

    delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            delivery_status IN (
                'pending',
                'sending',
                'sent',
                'failed'
            )
        ),

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_alerts_pending
    ON market_alerts (next_attempt_at, created_at)
    WHERE delivery_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_market_alerts_symbol_time
    ON market_alerts (symbol, timeframe, candle_time DESC);

COMMIT;
