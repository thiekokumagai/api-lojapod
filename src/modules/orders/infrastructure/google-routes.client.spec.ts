import axios from 'axios';
import { GoogleRoutesClient, GoogleRoutesError } from './google-routes.client';

// Nenhuma chamada real: o axios é um mock.
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
const post = axios.post as unknown as jest.Mock;

const KEY = 'AIza-chave-secreta-do-servidor';
const client = new GoogleRoutesClient();

beforeEach(() => {
  post.mockReset();
  process.env.GOOGLE_MAPS_SERVER_KEY = KEY;
});
afterEach(() => {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
});

const failure = async (promise: Promise<unknown>) =>
  (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as GoogleRoutesError;

describe('GoogleRoutesClient', () => {
  it('sem GOOGLE_MAPS_SERVER_KEY: erro "not_configured" e nenhuma chamada de rede', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    expect(client.isConfigured()).toBe(false);
    const error = await failure(client.distanceKm('A', 'B'));
    expect(error).toBeInstanceOf(GoogleRoutesError);
    expect(error.kind).toBe('not_configured');
    expect(post).not.toHaveBeenCalled();

    process.env.GOOGLE_MAPS_SERVER_KEY = '   ';
    expect(client.isConfigured()).toBe(false);
  });

  it('com chave: 1 chamada à Routes API, com a chave só no cabeçalho e pedindo só a distância', async () => {
    post.mockResolvedValue({
      status: 200,
      data: { routes: [{ distanceMeters: 4321 }] },
    });

    const km = await client.distanceKm('origem aqui', 'destino aqui');

    expect(km).toBeCloseTo(4.321);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
    );
    expect(body).toEqual({
      origin: { address: 'origem aqui' },
      destination: { address: 'destino aqui' },
      travelMode: 'DRIVE',
    });
    expect(config.headers['X-Goog-Api-Key']).toBe(KEY);
    expect(config.headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');
    // a chave não vai na URL nem no corpo
    expect(JSON.stringify([url, body])).not.toContain(KEY);
    expect(config.timeout).toBeGreaterThan(0);
  });

  it('endereço sem rota (HTTP 400/404 ou lista vazia): "no_route"', async () => {
    for (const response of [
      { status: 400, data: {} },
      { status: 404, data: {} },
      { status: 200, data: { routes: [] } },
    ]) {
      post.mockResolvedValueOnce(response);
      expect((await failure(client.distanceKm('A', 'B'))).kind).toBe(
        'no_route',
      );
    }
  });

  it('Google fora, chave recusada ou cota estourada: "unavailable"', async () => {
    for (const status of [401, 403, 429, 500, 503]) {
      post.mockResolvedValueOnce({ status, data: {} });
      const error = await failure(client.distanceKm('A', 'B'));
      expect(error.kind).toBe('unavailable');
      expect(error.status).toBe(status);
    }
  });

  it('resposta sem distância válida: "unavailable"', async () => {
    for (const data of [
      { routes: [{}] },
      { routes: [{ distanceMeters: 'x' }] },
      { routes: [{ distanceMeters: -1 }] },
      {},
    ]) {
      post.mockResolvedValueOnce({ status: 200, data });
      expect((await failure(client.distanceKm('A', 'B'))).kind).toBe(
        'unavailable',
      );
    }
  });

  it('erro de rede: "unavailable" e a chave NUNCA aparece no erro (o axios guarda os cabeçalhos no erro original)', async () => {
    const networkError = Object.assign(new Error('timeout'), {
      config: { headers: { 'X-Goog-Api-Key': KEY } },
    });
    post.mockRejectedValue(networkError);

    const error = await failure(client.distanceKm('A', 'B'));

    expect(error.kind).toBe('unavailable');
    const dump = JSON.stringify({
      message: error.message,
      error: Object.getOwnPropertyNames(error).map((p) =>
        String((error as unknown as Record<string, unknown>)[p]),
      ),
    });
    expect(dump).not.toContain(KEY);
    expect(error.message).not.toContain(KEY);
  });
});
