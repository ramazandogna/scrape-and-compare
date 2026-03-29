/**
 * Concurrency Queue Tests — Kontrollü paralel task yürütücü testleri.
 *
 * Neyi test ediyoruz?
 *   1. Temel çalışma: N item → N sonuç (hepsi fulfilled)
 *   2. Hata handling: başarısız task rejected döner, diğerlerini durdurmaz
 *   3. Concurrency limiti: aynı anda max N task çalışır
 *   4. Boş input: boş array → boş sonuç
 *   5. extractFulfilled / extractRejected helper'ları doğru filtreliyor mu
 */

import { describe, it, expect } from 'vitest';
import {
  runConcurrent,
  extractFulfilled,
  extractRejected,
} from '@/modules/scraper/helpers/concurrency';

describe('runConcurrent', () => {
  it('tüm tasklar başarılı → hepsi fulfilled döner', async () => {
    const items = ['a', 'b', 'c'];
    const worker = async (item: string) => item.toUpperCase();

    const results = await runConcurrent(items, worker, {
      concurrency: 2,
      label: 'test',
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', item: 'a', data: 'A' });
    expect(results[1]).toEqual({ status: 'fulfilled', item: 'b', data: 'B' });
    expect(results[2]).toEqual({ status: 'fulfilled', item: 'c', data: 'C' });
  });

  it('başarısız task rejected döner, diğerleri etkilenmez', async () => {
    const items = ['ok', 'fail', 'ok2'];
    const worker = async (item: string) => {
      if (item === 'fail') throw new Error('Bilerek hata');
      return item;
    };

    const results = await runConcurrent(items, worker, {
      concurrency: 3,
      label: 'test',
    });

    expect(results).toHaveLength(3);
    expect(results[0]!.status).toBe('fulfilled');
    expect(results[1]!.status).toBe('rejected');
    expect(results[2]!.status).toBe('fulfilled');

    // Rejected olanın error mesajı var mı
    if (results[1]!.status === 'rejected') {
      expect(results[1]!.error).toBe('Bilerek hata');
    }
  });

  it('boş input → boş sonuç döner', async () => {
    const results = await runConcurrent(
      [],
      async () => 'never',
      { concurrency: 2, label: 'test' },
    );

    expect(results).toHaveLength(0);
  });

  it('concurrency limiti aşılmaz', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const items = [1, 2, 3, 4, 5];
    const worker = async (_item: number) => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
      }
      // Küçük bir bekleme — slot'ların overlap'ini test et
      await new Promise((resolve) => setTimeout(resolve, 50));
      currentConcurrent--;
      return _item * 2;
    };

    const results = await runConcurrent(items, worker, {
      concurrency: 2,
      label: 'test',
    });

    expect(results).toHaveLength(5);
    // Max concurrent hiçbir zaman 2'yi aşmamalı
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('worker slotIndex parametresini doğru alır', async () => {
    const slotLog: number[] = [];

    await runConcurrent(
      ['a', 'b', 'c'],
      async (_item, _itemIndex, slotIndex) => {
        slotLog.push(slotIndex);
        return _item;
      },
      { concurrency: 2, label: 'test' },
    );

    // Her slot index 0 veya 1 olmalı (concurrency: 2)
    for (const slot of slotLog) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(2);
    }
  });
});

describe('extractFulfilled', () => {
  it('sadece başarılı sonuçları filtreler', async () => {
    const results = await runConcurrent(
      ['ok', 'fail', 'ok2'],
      async (item) => {
        if (item === 'fail') throw new Error('hata');
        return item.toUpperCase();
      },
      { concurrency: 3, label: 'test' },
    );

    const fulfilled = extractFulfilled(results);
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled[0]!.data).toBe('OK');
    expect(fulfilled[1]!.data).toBe('OK2');
  });
});

describe('extractRejected', () => {
  it('sadece hatalı sonuçları filtreler', async () => {
    const results = await runConcurrent(
      ['ok', 'fail1', 'fail2'],
      async (item) => {
        if (item.startsWith('fail')) throw new Error(`${item} hatası`);
        return item;
      },
      { concurrency: 3, label: 'test' },
    );

    const rejected = extractRejected(results);
    expect(rejected).toHaveLength(2);
    expect(rejected[0]!.item).toBe('fail1');
    expect(rejected[1]!.item).toBe('fail2');
  });
});
